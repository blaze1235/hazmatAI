const { extractText, preloadOcr } = require('./extractText');
const { parseHazmat } = require('./parseHazmat');
const { determinePlacards, THRESHOLD_LBS } = require('./placards');

const DISCLAIMER =
  '⚠️ Automated rule-based tool (49 CFR 172.504). Always verify against the physical BOL, ' +
  'the SDS, and current regulations — final responsibility lies with the shipper/carrier.';

const NO_ITEMS_HELP =
  "❌ No UN/NA numbers found.\n\n" +
  'Tips:\n' +
  '• Make sure the photo is sharp, well-lit, and the hazmat description lines are readable\n' +
  '• Crop to the hazardous materials section of the BOL if possible\n' +
  '• Or just type the shipment, e.g. "UN1203 gasoline, 8500 lbs" or "UN1830 and UN1993, 500 lbs each"\n\n' +
  'If the BOL genuinely has no UN/NA numbers, it may be a non-hazmat load — double-check for ' +
  'hazard class columns, "HM" / "X" flags, or the word HAZMAT before concluding no placards are needed.';

function formatItem(item, index) {
  const parts = [`${index + 1}. ${item.id}`];
  if (item.name) parts.push(`— ${item.name}`);
  parts.push(item.classCode ? `— Class ${item.classCode}${item.subsidiary ? ` (${item.subsidiary})` : ''}` : '— Class ???');
  if (item.packingGroup) parts.push(`— PG ${item.packingGroup}`);
  if (item.weightLbs !== null && item.weightLbs !== undefined) {
    parts.push(`— ${item.weightLbs.toLocaleString()} lbs${item.weightFromTotal ? ' (from doc total)' : ''}`);
  } else {
    parts.push('— weight not found');
  }
  const flags = [];
  if (item.limitedQty) flags.push('LTD QTY');
  if (item.inhalationHazard) flags.push('INHALATION HAZARD');
  if (item.rq) flags.push('RQ');
  if (flags.length) parts.push(`[${flags.join(', ')}]`);
  let line = parts.join(' ');
  if (item.classSource === 'lookup') line += '\n   (class from built-in UN table — confirm it matches the BOL)';
  if (item.note) line += `\n   Note: ${item.note}`;
  return line;
}

function buildReport(shipment, result, meta) {
  const lines = [];
  lines.push('✅ BOL Analysis — rule-based (49 CFR 172.504)');
  lines.push('');

  lines.push(`📋 Hazmat items detected: ${shipment.items.length}${shipment.bulk ? '   🛢 Bulk/cargo tank indicators found' : ''}`);
  shipment.items.forEach((item, i) => lines.push(formatItem(item, i)));
  lines.push('');

  if (result.required.length > 0) {
    lines.push('🚨 REQUIRED PLACARDS:');
    for (const r of result.required) {
      lines.push(`• ${r.placard}${r.placard === 'CLASS 9' ? ' (see note)' : ''} — ${r.reason}`);
      if (r.placard === 'CLASS 9') {
        lines.push('   Note: Class 9 placards are NOT required for domestic US highway transport (172.504(f)(9)); bulk packagings still need the UN number marking.');
      }
    }
    lines.push('');
    lines.push('Placard all 4 sides of the vehicle (front, rear, both sides), min 250mm, point-up square-on-point.');
  } else if (result.table2Exempt) {
    lines.push(`✅ NO PLACARDS REQUIRED: total Table 2 weight ${result.totalTable2Lbs.toLocaleString()} lbs is under the 1,001-lb threshold (49 CFR 172.504(c)) and no Table 1 materials were found.`);
    lines.push('Shipping papers, package marking/labeling, and emergency response info are still required.');
  } else if (shipment.items.length > 0 && result.conditional.length === 0) {
    lines.push('ℹ️ No placards determined — see warnings below.');
  }

  if (result.conditional.length > 0 && !result.table2Exempt) {
    lines.push('');
    lines.push(`❓ CONDITIONAL (verify weights — Table 2 threshold is ${THRESHOLD_LBS.toLocaleString()} lbs aggregate):`);
    for (const c of result.conditional) {
      lines.push(`• ${c.placard} — ${c.reason}`);
    }
    lines.push('If the aggregate gross weight of all Table 2 materials on the vehicle is 1,001 lbs or more, these placards ARE required.');
  }

  if (result.dangerousOption) {
    lines.push('');
    lines.push('🔀 MIXED LOAD OPTION: You may display a single DANGEROUS placard instead of the separate Table 2 placards above (49 CFR 172.504(b)).');
    if (result.dangerousOption.mustKeep.length > 0) {
      lines.push(`   Exception: ${result.dangerousOption.mustKeep.join(', ')} — 2,205+ lbs of this category means its specific placard must be used if loaded at one facility.`);
    }
  }

  if (shipment.bulk) {
    lines.push('');
    lines.push('🛢 BULK: display the UN identification number on the placards or on orange panels, all 4 sides (172.302, 172.332).');
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('⚠️ Warnings:');
    for (const w of result.warnings) lines.push(`• ${w}`);
  }

  if (meta.usedOcr) {
    lines.push('');
    lines.push('👁 Text was read via OCR — misreads are possible. Double-check UN numbers and weights against the document.');
  }

  lines.push('');
  lines.push(DISCLAIMER);
  return lines.join('\n');
}

// message: free text typed by user; files: [{ mimetype, buffer }]
async function analyzeShipment({ message = '', files = [] }) {
  let text = message || '';
  let methods = [];

  if (files.length > 0) {
    const extracted = await extractText(files);
    text += '\n' + extracted.text;
    methods = extracted.methods;
  }

  const usedOcr = methods.some((m) => m.includes('ocr'));
  const shipment = parseHazmat(text);

  if (shipment.items.length === 0) {
    let reply = NO_ITEMS_HELP;
    if (usedOcr) reply += '\n\n👁 (The file was read via OCR — a low-quality image can cause UN numbers to be missed.)';
    return { reply, itemCount: 0, methods };
  }

  const result = determinePlacards(shipment);
  const reply = buildReport(shipment, result, { usedOcr });
  return { reply, itemCount: shipment.items.length, methods };
}

module.exports = { analyzeShipment, preloadOcr };
