// Agent orchestrator. The LLM is the decision-maker: it reads the claim and its
// clinical note, calls deterministic fact-tools for verifiable codes/limits (so it
// never guesses medical facts), reasons step by step, and decides PAY/FLAG/DENY.
// The deterministic tools only supply facts; the disposition is the model's.
// Server-only module, imported by the API routes.

import sampleData from "@/data/sample-investigation.json";
import { GROUNDED_RULE_IDS, RULES, RULE_BY_ID, groundedFinding, runFact } from "@/lib/rules";
import type {
  AuditRecord,
  Claim,
  Investigation,
  RuleResult,
  RuleStatus,
  Verdict,
} from "@/lib/types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

// Minimal shape of the Anthropic content blocks we read (types vary by SDK version).
interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
}

export function keyAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function modelName(): string {
  return MODEL;
}

// The offline fallback shown when no API key is configured.
export function sampleInvestigation(): Investigation {
  return sampleData as Investigation;
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.8;
  return Math.min(1, Math.max(0, n));
}

// Safety net only: if the model omits a verdict we derive it from its findings.
function verdictFromFindings(findings: RuleResult[]): Verdict {
  if (findings.some((f) => f.status === "fail")) return "DENY";
  if (findings.some((f) => f.status === "flag")) return "FLAG";
  return "PAY";
}

function normalizeFindings(raw: unknown): RuleResult[] {
  if (!Array.isArray(raw)) return [];
  const out: RuleResult[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const ruleId = String((f as Record<string, unknown>).ruleId ?? "");
    const meta = RULE_BY_ID[ruleId];
    if (!meta) continue;
    const status = (f as Record<string, unknown>).status;
    const validStatus: RuleStatus =
      status === "fail" || status === "flag" ? status : "pass";
    out.push({
      ruleId,
      ruleName: meta.ruleName,
      status: validStatus,
      finding: String((f as Record<string, unknown>).finding ?? ""),
      citation: String((f as Record<string, unknown>).citation ?? ""),
    });
  }
  return out;
}

// Final per-concern findings = deterministic grounding for the four mechanical
// concerns + the model's own findings for the two judgment concerns
// (medical_necessity, documentation_validation), in canonical RULES order.
function groundFindings(
  llmFindings: RuleResult[],
  ctx: { claim: Claim; allClaims: Claim[] },
): RuleResult[] {
  const byId: Record<string, RuleResult> = {};
  for (const f of llmFindings) byId[f.ruleId] = f;
  return RULES.map((meta) => {
    if (GROUNDED_RULE_IDS.has(meta.ruleId)) return groundedFinding(meta.ruleId, ctx);
    return (
      byId[meta.ruleId] ?? {
        ruleId: meta.ruleId,
        ruleName: meta.ruleName,
        status: "pass" as RuleStatus,
        finding: "No concern identified from the clinical note.",
        citation: "",
      }
    );
  });
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  // The prompt asks for a bare JSON object; parse it directly when the model
  // complies. Only fall back to brace-slicing (which is fragile if the model
  // adds prose containing braces) when the whole message is not valid JSON.
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // fall through to brace slice
  }
  const s = trimmed.indexOf("{");
  const e = trimmed.lastIndexOf("}");
  if (s === -1 || e === -1 || e < s) return null;
  try {
    return JSON.parse(trimmed.slice(s, e + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = [
  "You are Verity, a payment-integrity adjudicator. You reason over a single medical claim,",
  "including its free-text clinical note, and decide a disposition: PAY, FLAG, or DENY.",
  "",
  "You have deterministic fact-lookup tools (bundling pairs, MUE limits, modifier validity,",
  "duplicate peer claims, necessity guidance, billed-code documentation). These return FACTS, not",
  "decisions. You MUST call the relevant tools to obtain codes, limits, and modifier facts rather",
  "than recalling them from memory. You are responsible for the judgment: assess medical necessity",
  "from the clinical note (the structured prefix match is only a coarse hint), judge whether the",
  "note supports the billed code and its complexity level (upcoding or insufficient documentation),",
  "and weigh documented exceptions such as a modifier 76/77 repeat.",
  "",
  "Investigate all six concerns: ncci_bundling, medical_necessity, frequency_units,",
  "modifier_validation, duplicate_claim, documentation_validation. Think step by step in short",
  "reasoning notes between tool calls. Taxonomy: a definitive overpayment or unadjudicable claim",
  "(unbundling without a bypass, MUE exceeded without a documented repeat, duplicate, invalid",
  "modifier) is a DENY-level 'fail'; a correctable or clinically ambiguous issue (questionable",
  "necessity, a missing but addable modifier, upcoding, insufficient documentation) is a",
  "FLAG-level 'flag'; otherwise 'pass'. Disposition mapping: any fail -> DENY, else any flag ->",
  "FLAG, else PAY.",
  "",
  "When you have all the facts you need, STOP calling tools. Your final message MUST be a single",
  "JSON object and NOTHING else: no preamble, no closing remark, no markdown, no code fences. Every",
  "field below is REQUIRED and must be non-empty (use an empty string for remediation only when the",
  "verdict is PAY):",
  '{"verdict":"PAY|FLAG|DENY","confidence":<number 0-1>,"rationale":"plain-English explanation',
  'citing the facts, never empty","remediation":"the concrete next step for a FLAG/DENY (e.g. add',
  'LT/RT and resubmit, downcode to 99213, provide the operative note); empty string only if PAY",',
  '"citedRules":["rule names that drove the decision"],"findings":[{"ruleId":"...","status":',
  '"pass|flag|fail","finding":"...","citation":"..."}]}. Include exactly one findings entry for each',
  "of the six concerns. Do not omit confidence or rationale.",
].join("\n");

export async function investigateLive(claim: Claim, allClaims: Claim[]): Promise<Investigation> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const tools = RULES.map((r) => ({
    name: r.ruleId,
    description: `${r.checks} Returns verifiable facts (not a verdict) for you to reason over.`,
    input_schema: { type: "object" as const, properties: {}, required: [] },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    {
      role: "user",
      content:
        "Adjudicate this claim. Call the fact tools you need, reason over the clinical note, " +
        `then output the final JSON.\n\n${JSON.stringify(claim, null, 2)}`,
    },
  ];

  const audit: AuditRecord[] = [];
  let jsonRetries = 0;
  let step = 0;
  const pushAudit = (rec: Omit<AuditRecord, "step" | "timestamp">) => {
    step += 1;
    audit.push({ ...rec, step, timestamp: new Date(Date.now() + step * 300).toISOString() });
  };

  for (let turn = 0; turn < 10; turn += 1) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });
    messages.push({ role: "assistant", content: resp.content });

    const blocks = resp.content as unknown as ContentBlock[];
    const toolUses = blocks.filter((b) => b.type === "tool_use");
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();

    if (toolUses.length === 0) {
      const parsed = extractJson(text);
      // The model ended its turn without emitting a parseable JSON object (it
      // sometimes narrates its analysis and forgets the final object). Record the
      // narration and nudge it once or twice for JSON only, rather than silently
      // falling back to a default disposition.
      if (!parsed && jsonRetries < 2) {
        jsonRetries += 1;
        if (text) {
          pushAudit({
            kind: "reasoning",
            toolCalled: "Reasoning",
            ruleId: null,
            input: null,
            output: null,
            citation: null,
            reasoning: text,
          });
        }
        messages.push({
          role: "user",
          content:
            "Output the final result now as a single JSON object that exactly matches the required schema (verdict, confidence, rationale, remediation, citedRules, findings). Return ONLY that JSON object: no analysis, no prose, no markdown fences.",
        });
        continue;
      }
      const llmFindings = normalizeFindings(parsed?.findings);
      // Deterministically ground the four mechanical concerns; keep the model's
      // findings only for the two judgment concerns. Verdict is a strict mapping
      // over all six, so a lookup can never be re-decided incorrectly by the model.
      const findings = groundFindings(llmFindings, { claim, allClaims });
      const verdict = verdictFromFindings(findings);
      const remediation =
        typeof parsed?.remediation === "string" && parsed.remediation.trim()
          ? parsed.remediation.trim()
          : undefined;
      if (text && !parsed) {
        pushAudit({
          kind: "reasoning",
          toolCalled: "Reasoning",
          ruleId: null,
          input: null,
          output: null,
          citation: null,
          reasoning: text,
        });
      }
      return {
        claimId: claim.id,
        verdict,
        confidence: clampConfidence(parsed?.confidence),
        rationale:
          typeof parsed?.rationale === "string" && parsed.rationale
            ? parsed.rationale
            : "See the cited findings for the basis of this disposition.",
        citedRules: Array.isArray(parsed?.citedRules) ? (parsed!.citedRules as string[]) : [],
        ruleResults: findings,
        remediation: verdict === "PAY" ? undefined : remediation,
        audit,
        mode: "live",
      };
    }

    // Reasoning narration that preceded this batch of tool calls.
    if (text) {
      pushAudit({
        kind: "reasoning",
        toolCalled: "Reasoning",
        ruleId: null,
        input: null,
        output: null,
        citation: null,
        reasoning: text,
      });
    }

    const toolResults: { type: "tool_result"; tool_use_id: string; content: string }[] = [];
    for (const tu of toolUses) {
      const name = tu.name ?? "";
      const meta = RULE_BY_ID[name];
      if (!meta) continue;
      const facts = runFact(name, { claim, allClaims });
      pushAudit({
        kind: "tool",
        toolCalled: meta.ruleName,
        ruleId: name,
        input: {},
        output: facts,
        citation: null,
        reasoning: `Retrieved facts for ${meta.ruleName}.`,
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id ?? "",
        content: JSON.stringify(facts),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // The model never finalized within the turn budget; return what we have.
  return {
    claimId: claim.id,
    verdict: "FLAG",
    confidence: 0.5,
    rationale: "The agent did not reach a final decision within the step budget; routing to review.",
    citedRules: [],
    ruleResults: [],
    audit,
    mode: "live",
  };
}
