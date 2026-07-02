// Medical code reference tables for the deterministic rules engine.
// An intentionally small, ILLUSTRATIVE subset modeled on real public sources, not
// the complete files or coverage policy:
//   NCCI PTP edits + MUEs: https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits
//   NCCI Policy Manual (edit rationale, modifier semantics): .../medicare-ncci-policy-manual
//   Medical necessity (LCD/NCD): https://www.cms.gov/medicare-coverage-database/
//   ICD-10-CM: https://www.cdc.gov/nchs/icd/icd-10-cm/files.html ; CPT/modifiers: AMA CPT.
// Necessity uses ICD-10 prefix matching (e.g. "R07" matches "R07.9") as a
// deliberate demo shortcut versus real code-specific necessity editing.

export interface NcciPair {
  code1: string; // comprehensive code
  code2: string; // component bundled into code1
  bypassModifiers: string[];
  note: string;
  citation: string;
}

export const NCCI_PAIRS: NcciPair[] = [
  {
    code1: "80053",
    code2: "82565",
    bypassModifiers: ["59", "XU", "XS"],
    note: "Creatinine (82565) is a constituent analyte of the comprehensive metabolic panel (80053).",
    citation: "NCCI PTP edit; AMA CPT panel definition for 80053 (CMP)",
  },
  {
    code1: "93000",
    code2: "93010",
    bypassModifiers: ["59", "XU"],
    note: "93000 (complete ECG) already includes the interpretation and report (93010).",
    citation: "NCCI PTP edit; CPT 93000 comprehensive of 93010",
  },
];

export interface NecessityRule {
  label: string;
  supportingIcdPrefixes: string[];
  citation: string;
}

export const NECESSITY: Record<string, NecessityRule> = {
  "93000": {
    label: "Electrocardiogram, complete",
    supportingIcdPrefixes: ["R07", "I48", "I20", "I10"],
    citation: "CMS LCD, electrocardiography medical necessity (illustrative)",
  },
  "70450": {
    label: "CT head/brain without contrast",
    supportingIcdPrefixes: ["R51", "S06", "R55", "G44"],
    citation: "CMS LCD, CT of the head medical necessity (illustrative)",
  },
  "27447": {
    label: "Total knee arthroplasty",
    supportingIcdPrefixes: ["M17"],
    citation: "CMS LCD, major joint replacement medical necessity (illustrative)",
  },
};

export interface FrequencyLimit {
  maxUnits: number;
  citation: string;
}

export const FREQUENCY_LIMITS: Record<string, FrequencyLimit> = {
  "93000": { maxUnits: 1, citation: "CMS Medically Unlikely Edits (MUE), 93000" },
  "71046": { maxUnits: 1, citation: "CMS Medically Unlikely Edits (MUE), 71046" },
  "27447": { maxUnits: 1, citation: "CMS Medically Unlikely Edits (MUE), 27447" },
  "80053": { maxUnits: 1, citation: "CMS Medically Unlikely Edits (MUE), 80053" },
  "82565": { maxUnits: 1, citation: "CMS Medically Unlikely Edits (MUE), 82565" },
  "99213": { maxUnits: 1, citation: "CMS Medically Unlikely Edits (MUE), established E/M" },
  "99214": { maxUnits: 1, citation: "CMS Medically Unlikely Edits (MUE), established E/M" },
};

export interface ModifierRule {
  requiredOneOf: string[];
  note: string;
  citation: string;
}

export const MODIFIER_RULES: Record<string, ModifierRule> = {
  "27447": {
    requiredOneOf: ["LT", "RT", "50"],
    note: "Major joint procedures require a laterality modifier to identify the operative side.",
    citation: "CMS, laterality modifiers (LT/RT/50)",
  },
};

// Recognized CPT/HCPCS modifiers for validation.
export const VALID_MODIFIERS = new Set<string>([
  "25", "26", "50", "51", "59", "76", "77", "91", "LT", "RT", "TC", "XE", "XS", "XP", "XU",
]);

// Modifiers that document a medically justified repeat (lift the frequency max).
export const REPEAT_MODIFIERS = ["76", "77"];
