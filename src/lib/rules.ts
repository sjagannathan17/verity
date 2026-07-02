// Deterministic fact-lookups. These do NOT decide anything: each returns the
// verifiable facts (code pairs, MUE limits, modifier validity, peer claims,
// necessity references) that the LLM orchestrator reasons over to reach a verdict.
// The reference tables live in ./codeTables.

import {
  FREQUENCY_LIMITS,
  MODIFIER_RULES,
  NCCI_PAIRS,
  NECESSITY,
  REPEAT_MODIFIERS,
  VALID_MODIFIERS,
} from "@/lib/codeTables";
import type {
  Claim,
  FactContext,
  FactFn,
  RuleMeta,
  RuleResult,
  RuleStatus,
} from "@/lib/types";

// NCCI procedure-to-procedure pairs present on the claim, with the bypass modifiers
// that would make the component separately payable and which are actually present.
const factBundling: FactFn = ({ claim }) => {
  const codes = new Set(claim.lines.map((l) => l.cptCode));
  const pairsPresent = NCCI_PAIRS.filter((p) => codes.has(p.code1) && codes.has(p.code2)).map((p) => {
    const componentLine = claim.lines.find((l) => l.cptCode === p.code2);
    const modifiersOnComponent = componentLine?.modifiers ?? [];
    return {
      comprehensiveCode: p.code1,
      componentCode: p.code2,
      bypassModifiers: p.bypassModifiers,
      modifiersOnComponent,
      bypassModifierPresent: modifiersOnComponent.some((m) => p.bypassModifiers.includes(m)),
      note: p.note,
      citation: p.citation,
    };
  });
  return { ncciPairsPresent: pairsPresent, citation: "NCCI PTP edits" };
};

// Reference guidance only: the diagnoses that typically support each billed CPT,
// plus whether the submitted structured diagnoses match. The model must judge
// necessity from the clinical note, not from this structured signal alone.
const factNecessity: FactFn = ({ claim }) => {
  const items = claim.lines
    .filter((l) => NECESSITY[l.cptCode])
    .map((l) => {
      const g = NECESSITY[l.cptCode];
      const structuredMatch = claim.diagnosisCodes.some((d) =>
        g.supportingIcdPrefixes.some((p) => d.toUpperCase().startsWith(p.toUpperCase())),
      );
      return {
        cptCode: l.cptCode,
        label: g.label,
        supportingIcdPrefixes: g.supportingIcdPrefixes,
        submittedDiagnoses: claim.diagnosisCodes,
        structuredPrefixMatch: structuredMatch,
        citation: g.citation,
      };
    });
  return {
    necessityGuidance: items,
    note: "structuredPrefixMatch is a coarse reference signal; judge necessity using the clinical note.",
  };
};

// Units billed per CPT vs. the Medically Unlikely Edit maximum, and whether a
// repeat modifier (76/77) is present to justify exceeding it.
const factFrequency: FactFn = ({ claim }) => {
  const totals: Record<string, { units: number; modifiers: string[] }> = {};
  for (const l of claim.lines) {
    const t = (totals[l.cptCode] ??= { units: 0, modifiers: [] });
    t.units += l.units;
    t.modifiers.push(...l.modifiers);
  }
  const lines = Object.entries(totals).map(([cpt, t]) => ({
    cptCode: cpt,
    unitsBilled: t.units,
    mueMaxPerDay: FREQUENCY_LIMITS[cpt]?.maxUnits ?? null,
    repeatModifierPresent: t.modifiers.some((m) => REPEAT_MODIFIERS.includes(m)),
    citation: FREQUENCY_LIMITS[cpt]?.citation ?? null,
  }));
  return { lines, repeatModifiers: REPEAT_MODIFIERS };
};

// Which modifiers are recognized vs. unrecognized, and any required laterality.
const factModifiers: FactFn = ({ claim }) => {
  const lines = claim.lines.map((l) => {
    const req = MODIFIER_RULES[l.cptCode];
    return {
      cptCode: l.cptCode,
      modifiers: l.modifiers,
      unrecognizedModifiers: l.modifiers.filter((m) => !VALID_MODIFIERS.has(m)),
      lateralityRequiredOneOf: req?.requiredOneOf ?? null,
      lateralityPresent: req ? l.modifiers.some((m) => req.requiredOneOf.includes(m)) : null,
      note: req?.note ?? null,
      citation: req?.citation ?? "CMS/HCPCS modifier reference",
    };
  });
  return { lines, recognizedModifiers: [...VALID_MODIFIERS] };
};

// Peer claims for the same member and date of service with overlapping procedures.
const factDuplicates: FactFn = ({ claim, allClaims }) => {
  const potentialDuplicates = allClaims
    .filter(
      (o) =>
        o.id !== claim.id &&
        o.memberId === claim.memberId &&
        o.dateOfService === claim.dateOfService,
    )
    .map((o) => ({
      claimId: o.id,
      overlappingCptCodes: claim.lines
        .map((l) => l.cptCode)
        .filter((c) => o.lines.some((x) => x.cptCode === c)),
    }))
    .filter((m) => m.overlappingCptCodes.length > 0);
  return {
    potentialDuplicates,
    criterion: "same member + date of service + overlapping CPT",
    citation: "Cotiviti duplicate-claim edit (same member/CPT/DOS)",
  };
};

// Billed codes, descriptions, and units, as a reference for the LLM. This tool
// deliberately returns NO verdict: whether the note supports the billed code and
// its complexity level (upcoding / insufficient documentation) is a clinical
// judgment the model makes from the free-text note.
const factDocumentation: FactFn = ({ claim }) => {
  const billedCodes = claim.lines.map((l) => ({
    cptCode: l.cptCode,
    description: l.description,
    units: l.units,
    modifiers: l.modifiers,
  }));
  return {
    billedCodes,
    clinicalNoteProvided: Boolean(claim.clinicalNote),
    note: "Reference only: judge from the clinical note whether it supports the billed code and its complexity/level. Flag upcoding (level billed above what the note supports) or insufficient documentation (billed procedure not documented as performed).",
  };
};

export const RULES: RuleMeta[] = [
  {
    ruleId: "ncci_bundling",
    ruleName: "Procedure-to-Procedure Edit",
    shortName: "Bundling",
    checks: "NCCI procedure-to-procedure bundling: are two codes billed together that should not be, without a bypass modifier?",
    fn: factBundling,
  },
  {
    ruleId: "medical_necessity",
    ruleName: "Medical Necessity",
    shortName: "Necessity",
    checks: "Does the diagnosis and clinical note support the billed procedure?",
    fn: factNecessity,
  },
  {
    ruleId: "frequency_units",
    ruleName: "Frequency / Units Limit",
    shortName: "Frequency",
    checks: "Are per-day units within the MUE maximum, allowing for a documented repeat (modifier 76/77)?",
    fn: factFrequency,
  },
  {
    ruleId: "modifier_validation",
    ruleName: "Modifier Validation",
    shortName: "Modifier",
    checks: "Are the modifiers recognized, and is any required laterality modifier present?",
    fn: factModifiers,
  },
  {
    ruleId: "duplicate_claim",
    ruleName: "Duplicate Claim",
    shortName: "Duplicate",
    checks: "Was the same member/procedure/date submitted on another claim?",
    fn: factDuplicates,
  },
  {
    ruleId: "documentation_validation",
    ruleName: "Documentation Validation",
    shortName: "Documentation",
    checks: "Does the clinical note support the billed code and its complexity/level, or is there upcoding or insufficient documentation?",
    fn: factDocumentation,
  },
];

export const RULE_BY_ID: Record<string, RuleMeta> = Object.fromEntries(
  RULES.map((r) => [r.ruleId, r]),
);

export function runFact(ruleId: string, ctx: FactContext): unknown {
  return RULE_BY_ID[ruleId].fn(ctx);
}

// Deterministic grounding for the four mechanical concerns. These are pure
// lookups over the claim, so the disposition for them should never depend on the
// model re-deriving a code, limit, or modifier. The model still owns the two
// judgment concerns (medical_necessity, documentation_validation).
export const GROUNDED_RULE_IDS = new Set([
  "ncci_bundling",
  "frequency_units",
  "modifier_validation",
  "duplicate_claim",
]);

type GroundedOutcome = { status: RuleStatus; finding: string; citation: string };

// Numeric ordering of synthetic claim ids (e.g. "C-1006" -> 1006), so duplicate
// grounding can distinguish the original from the later duplicate.
function claimSeq(id: string): number {
  const m = id.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

function groundBundling(claim: Claim): GroundedOutcome {
  const codes = new Set(claim.lines.map((l) => l.cptCode));
  const violation = NCCI_PAIRS.filter((p) => codes.has(p.code1) && codes.has(p.code2)).find((p) => {
    const componentLine = claim.lines.find((l) => l.cptCode === p.code2);
    const mods = componentLine?.modifiers ?? [];
    return !mods.some((m) => p.bypassModifiers.includes(m));
  });
  if (violation) {
    return {
      status: "fail",
      finding: `${violation.code2} is a component of ${violation.code1} and is billed on the same claim without a bypass modifier (${violation.bypassModifiers.join("/")}). ${violation.note}`,
      citation: violation.citation,
    };
  }
  return {
    status: "pass",
    finding: "No NCCI procedure-to-procedure pair is billed together without an appropriate bypass modifier.",
    citation: "NCCI PTP edits",
  };
}

function groundFrequency(claim: Claim): GroundedOutcome {
  const totals: Record<string, { units: number; modifiers: string[] }> = {};
  for (const l of claim.lines) {
    const t = (totals[l.cptCode] ??= { units: 0, modifiers: [] });
    t.units += l.units;
    t.modifiers.push(...l.modifiers);
  }
  for (const [cpt, t] of Object.entries(totals)) {
    const limit = FREQUENCY_LIMITS[cpt];
    const repeat = t.modifiers.some((m) => REPEAT_MODIFIERS.includes(m));
    if (limit && t.units > limit.maxUnits && !repeat) {
      return {
        status: "fail",
        finding: `${cpt} is billed ${t.units} units against an MUE maximum of ${limit.maxUnits}/day with no repeat modifier (76/77).`,
        citation: limit.citation,
      };
    }
  }
  return {
    status: "pass",
    finding: "Per-day units are within the MUE maximum, or a documented repeat modifier (76/77) justifies the units.",
    citation: "CMS Medically Unlikely Edits (MUE)",
  };
}

function groundModifier(claim: Claim): GroundedOutcome {
  for (const l of claim.lines) {
    const unrecognized = l.modifiers.filter((m) => !VALID_MODIFIERS.has(m));
    if (unrecognized.length) {
      return {
        status: "fail",
        finding: `Unrecognized modifier(s) ${unrecognized.join(", ")} on ${l.cptCode}; the claim cannot be adjudicated as submitted.`,
        citation: "CMS/HCPCS modifier reference",
      };
    }
  }
  for (const l of claim.lines) {
    const req = MODIFIER_RULES[l.cptCode];
    if (req && !l.modifiers.some((m) => req.requiredOneOf.includes(m))) {
      return {
        status: "flag",
        finding: `${l.cptCode} requires a laterality modifier (${req.requiredOneOf.join("/")}) but none is present; correctable on resubmission.`,
        citation: req.citation,
      };
    }
  }
  return {
    status: "pass",
    finding: "All submitted modifiers are recognized and any required laterality modifier is present.",
    citation: "CMS/HCPCS modifier reference",
  };
}

function groundDuplicate(claim: Claim, allClaims: Claim[]): GroundedOutcome {
  const seq = claimSeq(claim.id);
  const earlier = allClaims.find(
    (o) =>
      o.id !== claim.id &&
      o.memberId === claim.memberId &&
      o.dateOfService === claim.dateOfService &&
      claimSeq(o.id) < seq &&
      claim.lines.some((l) => o.lines.some((x) => x.cptCode === l.cptCode)),
  );
  if (earlier) {
    const overlap = claim.lines
      .map((l) => l.cptCode)
      .filter((c) => earlier.lines.some((x) => x.cptCode === c));
    return {
      status: "fail",
      finding: `Duplicates earlier claim ${earlier.id}: same member and date of service with overlapping CPT (${overlap.join(", ")}).`,
      citation: "Cotiviti duplicate-claim edit (same member/CPT/DOS)",
    };
  }
  return {
    status: "pass",
    finding: "No earlier peer claim matches this member, date of service, and CPT; this is the original, not a duplicate.",
    citation: "Cotiviti duplicate-claim edit (same member/CPT/DOS)",
  };
}

export function groundedFinding(ruleId: string, ctx: FactContext): RuleResult {
  const meta = RULE_BY_ID[ruleId];
  const { claim, allClaims } = ctx;
  let outcome: GroundedOutcome;
  switch (ruleId) {
    case "ncci_bundling":
      outcome = groundBundling(claim);
      break;
    case "frequency_units":
      outcome = groundFrequency(claim);
      break;
    case "modifier_validation":
      outcome = groundModifier(claim);
      break;
    case "duplicate_claim":
      outcome = groundDuplicate(claim, allClaims);
      break;
    default:
      outcome = { status: "pass", finding: "", citation: "" };
  }
  return {
    ruleId,
    ruleName: meta.ruleName,
    status: outcome.status,
    finding: outcome.finding,
    citation: outcome.citation,
  };
}
