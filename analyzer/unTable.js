// Compact lookup of common UN/NA numbers -> hazard class + proper shipping name.
// Sourced from the 49 CFR 172.101 Hazardous Materials Table (common highway entries).
// Used as a fallback when the hazard class is not printed near the UN number on the BOL.
// classCode uses division notation where applicable ("3", "2.1", "5.1", "8", "9", "1.4", ...).

const UN_TABLE = {
  // Class 1 — Explosives
  UN0030: { name: 'Detonators, electric', classCode: '1.1' },
  UN0331: { name: 'Explosive, blasting, type B (ANFO)', classCode: '1.5' },
  UN0335: { name: 'Fireworks', classCode: '1.3' },
  UN0336: { name: 'Fireworks', classCode: '1.4' },
  UN0432: { name: 'Articles, pyrotechnic', classCode: '1.4' },

  // Class 2 — Gases
  UN1001: { name: 'Acetylene, dissolved', classCode: '2.1' },
  UN1002: { name: 'Air, compressed', classCode: '2.2' },
  UN1005: { name: 'Ammonia, anhydrous', classCode: '2.2', note: 'Domestic US: 2.2 with INHALATION HAZARD marking; international: 2.3' },
  UN1006: { name: 'Argon, compressed', classCode: '2.2' },
  UN1011: { name: 'Butane', classCode: '2.1' },
  UN1013: { name: 'Carbon dioxide', classCode: '2.2' },
  UN1017: { name: 'Chlorine', classCode: '2.3' },
  UN1046: { name: 'Helium, compressed', classCode: '2.2' },
  UN1049: { name: 'Hydrogen, compressed', classCode: '2.1' },
  UN1066: { name: 'Nitrogen, compressed', classCode: '2.2' },
  UN1072: { name: 'Oxygen, compressed', classCode: '2.2' },
  UN1073: { name: 'Oxygen, refrigerated liquid', classCode: '2.2' },
  UN1075: { name: 'Petroleum gases, liquefied (LPG)', classCode: '2.1' },
  UN1079: { name: 'Sulfur dioxide', classCode: '2.3' },
  UN1977: { name: 'Nitrogen, refrigerated liquid', classCode: '2.2' },
  UN1978: { name: 'Propane', classCode: '2.1' },
  UN1950: { name: 'Aerosols', classCode: '2.1', note: 'Aerosols may be 2.1 or 2.2 depending on contents — verify' },
  UN2187: { name: 'Carbon dioxide, refrigerated liquid', classCode: '2.2' },

  // Class 3 — Flammable / combustible liquids
  UN1090: { name: 'Acetone', classCode: '3' },
  UN1170: { name: 'Ethanol / ethanol solution', classCode: '3' },
  UN1202: { name: 'Diesel fuel / gas oil', classCode: '3', note: 'May be reclassified combustible liquid domestically' },
  UN1203: { name: 'Gasoline', classCode: '3' },
  UN1219: { name: 'Isopropanol', classCode: '3' },
  UN1230: { name: 'Methanol', classCode: '3', subsidiary: '6.1' },
  UN1263: { name: 'Paint / paint-related material', classCode: '3' },
  UN1267: { name: 'Petroleum crude oil', classCode: '3' },
  UN1268: { name: 'Petroleum distillates, n.o.s.', classCode: '3' },
  UN1863: { name: 'Fuel, aviation, turbine engine (jet fuel)', classCode: '3' },
  UN1866: { name: 'Resin solution', classCode: '3' },
  UN1987: { name: 'Alcohols, n.o.s.', classCode: '3' },
  UN1993: { name: 'Flammable liquid, n.o.s.', classCode: '3' },
  NA1993: { name: 'Fuel oil / combustible liquid, n.o.s.', classCode: '3', note: 'NA1993 typically combustible liquid — COMBUSTIBLE placard' },
  UN3475: { name: 'Ethanol and gasoline mixture (E85)', classCode: '3' },

  // Class 4
  UN1325: { name: 'Flammable solid, organic, n.o.s.', classCode: '4.1' },
  UN1350: { name: 'Sulfur', classCode: '4.1' },
  UN1944: { name: 'Matches, safety', classCode: '4.1' },
  UN1361: { name: 'Carbon (charcoal)', classCode: '4.2' },
  UN1381: { name: 'Phosphorus, white or yellow', classCode: '4.2', subsidiary: '6.1' },
  UN1402: { name: 'Calcium carbide', classCode: '4.3' },
  UN1415: { name: 'Lithium', classCode: '4.3' },
  UN1428: { name: 'Sodium', classCode: '4.3' },

  // Class 5
  UN1479: { name: 'Oxidizing solid, n.o.s.', classCode: '5.1' },
  UN1495: { name: 'Sodium chlorate', classCode: '5.1' },
  UN1748: { name: 'Calcium hypochlorite, dry', classCode: '5.1' },
  UN1942: { name: 'Ammonium nitrate', classCode: '5.1' },
  UN2014: { name: 'Hydrogen peroxide, aqueous solution (20-60%)', classCode: '5.1', subsidiary: '8' },
  UN2067: { name: 'Ammonium nitrate based fertilizer', classCode: '5.1' },
  UN3149: { name: 'Hydrogen peroxide and peroxyacetic acid mixture', classCode: '5.1', subsidiary: '8' },

  // Class 6
  UN1588: { name: 'Cyanides, inorganic, solid, n.o.s.', classCode: '6.1' },
  UN2078: { name: 'Toluene diisocyanate', classCode: '6.1' },
  UN2783: { name: 'Organophosphorus pesticide, solid, toxic', classCode: '6.1' },
  UN2810: { name: 'Toxic liquid, organic, n.o.s.', classCode: '6.1' },
  UN3288: { name: 'Toxic solid, inorganic, n.o.s.', classCode: '6.1' },

  // Class 8 — Corrosives
  UN1760: { name: 'Corrosive liquid, n.o.s.', classCode: '8' },
  UN1789: { name: 'Hydrochloric acid', classCode: '8' },
  UN1791: { name: 'Hypochlorite solution', classCode: '8' },
  UN1805: { name: 'Phosphoric acid solution', classCode: '8' },
  UN1814: { name: 'Potassium hydroxide, solution', classCode: '8' },
  UN1823: { name: 'Sodium hydroxide, solid', classCode: '8' },
  UN1824: { name: 'Sodium hydroxide solution', classCode: '8' },
  UN1830: { name: 'Sulfuric acid (>51%)', classCode: '8' },
  UN1832: { name: 'Sulfuric acid, spent', classCode: '8' },
  UN2031: { name: 'Nitric acid (<=70%)', classCode: '8' },
  UN2794: { name: 'Batteries, wet, filled with acid', classCode: '8' },
  UN2796: { name: 'Sulfuric acid (<=51%) / battery fluid, acid', classCode: '8' },
  UN2800: { name: 'Batteries, wet, non-spillable', classCode: '8' },
  UN3264: { name: 'Corrosive liquid, acidic, inorganic, n.o.s.', classCode: '8' },
  UN3266: { name: 'Corrosive liquid, basic, inorganic, n.o.s.', classCode: '8' },

  // Class 9 — Miscellaneous
  UN1845: { name: 'Carbon dioxide, solid (dry ice)', classCode: '9', note: 'Not regulated for US highway transport' },
  UN2212: { name: 'Asbestos, amphibole', classCode: '9' },
  UN2448: { name: 'Sulfur, molten', classCode: '9' },
  UN3077: { name: 'Environmentally hazardous substance, solid, n.o.s.', classCode: '9' },
  UN3082: { name: 'Environmentally hazardous substance, liquid, n.o.s.', classCode: '9' },
  UN3090: { name: 'Lithium metal batteries', classCode: '9' },
  UN3091: { name: 'Lithium metal batteries packed with/in equipment', classCode: '9' },
  UN3257: { name: 'Elevated temperature liquid, n.o.s.', classCode: '9' },
  UN3268: { name: 'Safety devices (air bag modules, seat-belt pretensioners)', classCode: '9' },
  UN3480: { name: 'Lithium ion batteries', classCode: '9' },
  UN3481: { name: 'Lithium ion batteries packed with/in equipment', classCode: '9' },
};

function lookupUN(id) {
  return UN_TABLE[id] || null;
}

module.exports = { UN_TABLE, lookupUN };
