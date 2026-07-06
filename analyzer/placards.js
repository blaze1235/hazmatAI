// Placard determination per 49 CFR 172.504 Tables 1 & 2.
// Table 1 materials require placards in ANY quantity.
// Table 2 materials require placards at >= 454 kg (1,001 lbs) aggregate gross weight
// (non-bulk; bulk packagings are always placarded and marked with the UN number).

const THRESHOLD_LBS = 1001;
const DANGEROUS_SINGLE_CATEGORY_LIMIT_LBS = 2205; // 1,000 kg from one category at one facility

function table1Placard(item) {
  const c = item.classCode;
  if (!c) return null;
  if (c.startsWith('1.1')) return 'EXPLOSIVES 1.1';
  if (c.startsWith('1.2')) return 'EXPLOSIVES 1.2';
  if (c.startsWith('1.3')) return 'EXPLOSIVES 1.3';
  if (c === '2.3') return 'POISON GAS';
  if (c === '4.3') return 'DANGEROUS WHEN WET';
  if (c === '6.1' && item.inhalationHazard) return 'POISON INHALATION HAZARD';
  if (c === '7') return item.yellowIII ? 'RADIOACTIVE' : null;
  return null;
}

function table2Placard(item, shipment) {
  const c = item.classCode;
  if (!c) return null;
  if (c.startsWith('1.4')) return 'EXPLOSIVES 1.4';
  if (c.startsWith('1.5')) return 'EXPLOSIVES 1.5';
  if (c.startsWith('1.6')) return 'EXPLOSIVES 1.6';
  if (c === '2.1') return 'FLAMMABLE GAS';
  if (c === '2.2') return 'NON-FLAMMABLE GAS';
  // COMBUSTIBLE only when the document itself says "combustible liquid" —
  // reclassification is the shipper's call, not something to infer.
  if (c === '3') return shipment.combustible ? 'COMBUSTIBLE' : 'FLAMMABLE';
  if (c === '4.1') return 'FLAMMABLE SOLID';
  if (c === '4.2') return 'SPONTANEOUSLY COMBUSTIBLE';
  if (c === '5.1') return 'OXIDIZER';
  if (c === '5.2') return 'ORGANIC PEROXIDE';
  if (c === '6.1') return 'POISON';
  if (c === '8') return 'CORROSIVE';
  if (c === '9') return 'CLASS 9';
  return null;
}

function determinePlacards(shipment) {
  const required = []; // { placard, reason, table }
  const conditional = []; // Table 2 items with unknown weight
  const warnings = [];
  const table2 = new Map(); // placard -> { weightLbs, weightKnown, items }

  for (const item of shipment.items) {
    const label = `${item.id}${item.name ? ' ' + item.name : ''}`;

    if (!item.classCode) {
      warnings.push(
        `${label}: hazard class not found on the document and not in the built-in lookup — ` +
          `determine the class from the BOL/SDS before placarding.`
      );
      continue;
    }

    if (item.limitedQty) {
      warnings.push(`${label}: marked Limited Quantity — excepted from placarding (49 CFR 172.500(b)). Verify the LTD QTY marking.`);
      continue;
    }

    const t1 = table1Placard(item);
    if (t1) {
      required.push({ placard: t1, reason: `${label} (Class ${item.classCode}) — Table 1: required in ANY quantity`, table: 1 });
      continue;
    }

    if (item.classCode === '7') {
      warnings.push(`${label}: Class 7 — RADIOACTIVE placard required only for Yellow-III labels, exclusive-use, or highway-route-controlled shipments. Check the package labels.`);
      continue;
    }
    if (item.classCode === '6.2') {
      warnings.push(`${label}: Division 6.2 (infectious substances) — no placard required.`);
      continue;
    }

    const t2 = table2Placard(item, shipment);
    if (!t2) {
      warnings.push(`${label}: Class ${item.classCode} not recognized by the rules engine — verify manually.`);
      continue;
    }

    if (!table2.has(t2)) table2.set(t2, { weightLbs: 0, weightKnown: true, items: [] });
    const bucket = table2.get(t2);
    bucket.items.push(label + ` (Class ${item.classCode})`);
    if (item.weightLbs !== null && item.weightLbs !== undefined) {
      bucket.weightLbs += item.weightLbs;
    } else {
      bucket.weightKnown = false;
    }
  }

  // Table 2 evaluation
  const metCategories = [];
  for (const [placard, bucket] of table2) {
    const itemsStr = bucket.items.join('; ');
    if (shipment.bulk) {
      required.push({ placard, reason: `${itemsStr} — bulk packaging: placard regardless of quantity; display UN number on placard or orange panel`, table: 2 });
      metCategories.push(placard);
    } else if (bucket.weightKnown && bucket.weightLbs >= THRESHOLD_LBS) {
      required.push({ placard, reason: `${itemsStr} — Table 2: aggregate ${bucket.weightLbs.toLocaleString()} lbs ≥ 1,001 lbs`, table: 2 });
      metCategories.push(placard);
    } else if (bucket.weightKnown) {
      // below threshold — but only exempt if TOTAL table 2 weight is under 1,001 lbs (172.504(c))
      conditional.push({ placard, reason: `${itemsStr} — ${bucket.weightLbs.toLocaleString()} lbs in this category`, weightLbs: bucket.weightLbs, known: true });
    } else {
      conditional.push({ placard, reason: `${itemsStr} — weight not found on document`, weightLbs: bucket.weightLbs, known: false });
    }
  }

  // 172.504(c): the <1,001 lbs exception applies to the aggregate of ALL Table 2 materials.
  const allKnown = [...table2.values()].every((b) => b.weightKnown);
  const totalTable2Lbs = [...table2.values()].reduce((sum, b) => sum + b.weightLbs, 0);
  let table2Exempt = false;
  if (!shipment.bulk && allKnown && table2.size > 0 && totalTable2Lbs < THRESHOLD_LBS && metCategories.length === 0) {
    table2Exempt = true;
  } else if (conditional.length > 0 && allKnown && totalTable2Lbs >= THRESHOLD_LBS) {
    // Total across categories >= 1,001 lbs: every Table 2 category on board must be placarded
    for (const c of conditional.splice(0)) {
      required.push({ placard: c.placard, reason: `${c.reason} — total Table 2 weight on vehicle (${totalTable2Lbs.toLocaleString()} lbs) ≥ 1,001 lbs, so all Table 2 categories must be placarded`, table: 2 });
      metCategories.push(c.placard);
    }
  }

  // DANGEROUS placard option (172.504(b)): 2+ Table 2 categories may be covered
  // by a single DANGEROUS placard, unless 2,205+ lbs of one category was loaded at one facility.
  let dangerousOption = null;
  const table2Required = required.filter((r) => r.table === 2 && r.placard !== 'CLASS 9');
  if (table2Required.length >= 2) {
    const over = table2Required.filter((r) => {
      const bucket = table2.get(r.placard);
      return bucket && bucket.weightKnown && bucket.weightLbs >= DANGEROUS_SINGLE_CATEGORY_LIMIT_LBS;
    });
    dangerousOption = {
      allowed: true,
      mustKeep: over.map((r) => r.placard),
    };
  }

  return { required, conditional, warnings, table2Exempt, totalTable2Lbs, allKnown, dangerousOption };
}

module.exports = { determinePlacards, THRESHOLD_LBS };
