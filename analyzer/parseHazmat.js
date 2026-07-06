const { lookupUN } = require('./unTable');

const KG_TO_LBS = 2.20462;

// Window of characters around a UN number treated as that item's description.
const WINDOW_BEFORE = 100;
const WINDOW_AFTER = 220;

const CLASS_PATTERNS = [
  /(?:HAZ(?:ARD)?\s*)?CLASS(?:\/DIV(?:ISION)?)?\.?\s*:?\s*([1-9](?:\.\d[A-G]?)?)/i,
  /\bDIV(?:ISION)?\.?\s*:?\s*([1-9]\.\d[A-G]?)/i,
  /\b([1-6]\.\d[A-G]?)\b/, // bare division token like 2.1, 5.1, 1.4G
  // single-digit class inside a comma-separated shipping description: ", 3, PG II" / ", 8, III"
  /,\s*([1-9])\s*,?\s*(?:PG\s*)?I{1,3}\b/i,
  /,\s*([1-9])\s*(?:,|$)/m,
];

const PG_PATTERN = /\b(?:PG|P\.G\.|PACKING\s*GROUP)\s*:?\s*(III|II|I|[1-3])\b/i;
const WEIGHT_PATTERN = /([\d,]+(?:\.\d+)?)\s*(LBS?|POUNDS?|#|KGS?|KILOS?|KILOGRAMS?)\b/gi;
const TOTAL_WEIGHT_PATTERN = /TOTAL\s*(?:GROSS\s*)?(?:WEIGHT|WT)\s*:?\s*([\d,]+(?:\.\d+)?)\s*(LBS?|POUNDS?|KGS?|KILOS?|KILOGRAMS?)?/i;

function toLbs(value, unit) {
  const n = parseFloat(value.replace(/,/g, ''));
  if (!isFinite(n)) return null;
  return /K/i.test(unit || 'LB') ? Math.round(n * KG_TO_LBS) : Math.round(n);
}

function romanPG(raw) {
  if (!raw) return null;
  const map = { 1: 'I', 2: 'II', 3: 'III' };
  return map[raw] || raw.toUpperCase();
}

function findClass(windowText) {
  for (const pattern of CLASS_PATTERNS) {
    const m = windowText.match(pattern);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

// First weight-with-unit in the window — shipping descriptions list the item's
// own weight before any totals or the next item.
function findWeightLbs(windowText) {
  for (const m of windowText.matchAll(WEIGHT_PATTERN)) {
    const lbs = toLbs(m[1], m[2]);
    if (lbs !== null) return lbs;
  }
  return null;
}

// Guess the proper shipping name: uppercase-ish words following the UN number,
// stopping at class/PG/weight tokens.
function guessName(afterText) {
  const m = afterText.match(/^[\s,.:-]*([A-Za-z][A-Za-z ,.'()/-]{2,60}?)(?=\s*(?:,\s*\d|\bCLASS\b|\bPG\b|\bI{1,3}\b\s*(?:,|$)|\d{2,}|\bHAZ\b|$))/i);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, ' ').trim().replace(/[,.:-]+$/, '');
  return name.length >= 3 ? name : null;
}

function parseHazmat(rawText) {
  const text = rawText.replace(/[ \t]+/g, ' ');
  const items = [];
  const seen = new Set();

  const unPattern = /\b(UN|NA)\s?-?\s?(\d{4})\b/gi;
  const matches = [...text.matchAll(unPattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const id = match[1].toUpperCase() + match[2];
    if (seen.has(id)) continue;
    seen.add(id);

    // Clamp each item's window at the neighboring UN numbers so one item's
    // class/PG/weight can't bleed into another's.
    const prevEnd = i > 0 ? matches[i - 1].index + matches[i - 1][0].length : 0;
    const nextStart = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const start = Math.max(prevEnd, match.index - WINDOW_BEFORE);
    const end = Math.min(nextStart, match.index + match[0].length + WINDOW_AFTER);
    const windowText = text.slice(start, end);
    const afterText = text.slice(match.index + match[0].length, end);

    // Prefer data AFTER the UN number (standard shipping-description order);
    // the wider window is only a fallback for "GASOLINE, 3, PG II, UN1203" layouts.
    const known = lookupUN(id);
    const parsedClass = findClass(afterText) || findClass(windowText);
    const pgMatch = afterText.match(PG_PATTERN) || windowText.match(PG_PATTERN);

    const item = {
      id,
      name: guessName(afterText) || (known ? known.name : null),
      classCode: parsedClass || (known ? known.classCode : null),
      classSource: parsedClass ? 'document' : known ? 'lookup' : null,
      subsidiary: known ? known.subsidiary || null : null,
      packingGroup: pgMatch ? romanPG(pgMatch[1]) : null,
      weightLbs: findWeightLbs(afterText) ?? findWeightLbs(windowText),
      limitedQty: /LTD\.?\s*QTY|LIMITED\s*QUANTIT/i.test(windowText),
      inhalationHazard: /INHALATION\s*HAZARD|POISON\s*-?\s*INHALATION|\bPIH\b|\bTIH\b|(?:HAZARD\s*)?ZONE\s*[AB]\b/i.test(windowText),
      rq: /\bRQ\b/.test(windowText),
      note: known ? known.note || null : null,
    };

    // Class 7 label category (needed for the RADIOACTIVE placard rule)
    if (item.classCode === '7' || /RADIOACTIVE/i.test(windowText)) {
      item.classCode = item.classCode || '7';
      item.yellowIII = /YELLOW[\s-]*III/i.test(windowText);
    }

    items.push(item);
  }

  const totalMatch = text.match(TOTAL_WEIGHT_PATTERN);
  const docTotalLbs = totalMatch ? toLbs(totalMatch[1], totalMatch[2]) : null;

  // Single hazmat item with no per-item weight: fall back to the document total.
  if (docTotalLbs && items.length === 1 && items[0].weightLbs === null) {
    items[0].weightLbs = docTotalLbs;
    items[0].weightFromTotal = true;
  }

  return {
    items,
    docTotalLbs,
    bulk: /CARGO\s*TANK|TANK\s*TRUCK|TANKER|\bBULK\b|\bISO\s*TANK|TANK\s*CAR/i.test(text),
    combustible: /COMBUSTIBLE\s*LIQUID/i.test(text),
    marinePollutant: /MARINE\s*POLLUTANT/i.test(text),
  };
}

module.exports = { parseHazmat };
