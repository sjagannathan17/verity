import { NextResponse } from "next/server";

import claimsData from "@/data/claims.json";
import { investigateLive, keyAvailable } from "@/lib/agent";
import { RULES } from "@/lib/rules";
import type { Claim, RuleResult, Verdict } from "@/lib/types";

export const runtime = "nodejs";
// Live evaluation runs the LLM on every claim; give it room.
export const maxDuration = 300;

const CLAIMS = claimsData as Claim[];

interface EvalRow {
  claimId: string;
  scenario: string;
  groundTruth: Verdict;
  verdict: Verdict;
  correct: boolean;
  confidence: number;
  drivingRuleIds: string[];
  drivingRules: string[];
  ruleResults: RuleResult[];
}

export async function GET() {
  if (!keyAvailable()) {
    return NextResponse.json(
      { error: "Live evaluation requires ANTHROPIC_API_KEY in .env.local." },
      { status: 400 },
    );
  }

  const results: EvalRow[] = [];
  for (const claim of CLAIMS) {
    const inv = await investigateLive(claim, CLAIMS);
    const drivers = inv.ruleResults.filter((r) => r.status !== "pass");
    results.push({
      claimId: claim.id,
      scenario: claim.scenario,
      groundTruth: claim.groundTruth,
      verdict: inv.verdict,
      correct: inv.verdict === claim.groundTruth,
      confidence: inv.confidence,
      drivingRuleIds: drivers.map((d) => d.ruleId),
      drivingRules: drivers.map((d) => d.ruleName),
      ruleResults: inv.ruleResults,
    });
  }

  const correct = results.filter((r) => r.correct).length;

  const perRule = RULES.map((meta) => {
    const fired = results.filter((r) =>
      r.ruleResults.some((rr) => rr.ruleId === meta.ruleId && rr.status !== "pass"),
    ).length;
    const drove = results.filter((r) => r.drivingRuleIds.includes(meta.ruleId)).length;
    return { ruleId: meta.ruleId, ruleName: meta.ruleName, shortName: meta.shortName, fired, drove };
  });

  return NextResponse.json({
    mode: "live",
    total: results.length,
    correct,
    accuracy: results.length ? correct / results.length : 0,
    results,
    perRule,
  });
}
