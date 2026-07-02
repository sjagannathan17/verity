// Core domain types for Verity: Payment Integrity Reasoning Copilot.

export type RuleStatus = "pass" | "flag" | "fail";
export type Verdict = "PAY" | "FLAG" | "DENY";
export type RunMode = "live" | "sample";

export interface ClaimLine {
  cptCode: string;
  description: string;
  units: number;
  modifiers: string[];
  chargeAmount: number;
}

export interface Claim {
  id: string;
  memberId: string;
  dateOfService: string;
  provider: string;
  providerSpecialty: string;
  diagnosisCodes: string[]; // ICD-10-CM
  lines: ClaimLine[]; // CPT/HCPCS lines
  clinicalNote: string;
  scenario: string; // human label, e.g. "Bundling violation"
  groundTruth: Verdict; // labeled reference for the eval tab
}

// The LLM's per-concern judgment. The deterministic tools supply facts; the model
// decides the status, so this is the model's conclusion, not a rule's output.
export interface RuleResult {
  ruleId: string;
  ruleName: string;
  status: RuleStatus;
  finding: string;
  citation: string;
}

// One step in the agent's reasoning trail: either the model narrating its reasoning
// or a fact-tool call and its returned facts.
export interface AuditRecord {
  step: number;
  kind: "reasoning" | "tool";
  toolCalled: string; // fact-tool name, or "Reasoning"
  ruleId: string | null; // the concern this step relates to, if any
  input: unknown;
  output: unknown; // returned facts for a tool step; null for a reasoning step
  citation: string | null;
  timestamp: string;
  reasoning: string; // the model's narration for this step
}

export interface Investigation {
  claimId: string;
  verdict: Verdict;
  confidence: number; // 0-1, model-assessed
  rationale: string;
  citedRules: string[];
  ruleResults: RuleResult[]; // the model's per-concern findings
  remediation?: string; // concrete next step for a FLAG/DENY (e.g. "downcode to 99213")
  audit: AuditRecord[];
  mode: RunMode;
}

// Context passed to a fact-lookup (peer claims are needed for duplicate detection).
export interface FactContext {
  claim: Claim;
  allClaims: Claim[];
}

export type FactFn = (ctx: FactContext) => unknown;

export interface RuleMeta {
  ruleId: string;
  ruleName: string;
  shortName: string;
  checks: string; // one-line description of what the concern covers
  fn: FactFn;
}
