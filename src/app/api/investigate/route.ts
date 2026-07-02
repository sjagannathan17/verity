import { NextRequest, NextResponse } from "next/server";

import claimsData from "@/data/claims.json";
import { investigateLive, keyAvailable, sampleInvestigation } from "@/lib/agent";
import type { Claim, RunMode } from "@/lib/types";

export const runtime = "nodejs";

const CLAIMS = claimsData as Claim[];

async function run(claimId: string, mode: RunMode) {
  // No key, or the caller explicitly asked for the offline sample.
  if (mode === "sample" || !keyAvailable()) {
    return NextResponse.json(sampleInvestigation());
  }
  const claim = CLAIMS.find((c) => c.id === claimId);
  if (!claim) {
    return NextResponse.json({ error: `Claim ${claimId} not found` }, { status: 404 });
  }
  try {
    return NextResponse.json(await investigateLive(claim, CLAIMS));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Live investigation failed" },
      { status: 502 },
    );
  }
}

function parseMode(value: unknown): RunMode {
  return value === "live" ? "live" : "sample";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body?.claimId) {
    return NextResponse.json({ error: "claimId is required" }, { status: 400 });
  }
  return run(body.claimId, parseMode(body.mode));
}

export async function GET(req: NextRequest) {
  const claimId = req.nextUrl.searchParams.get("claimId");
  if (!claimId) {
    return NextResponse.json({ error: "claimId is required" }, { status: 400 });
  }
  return run(claimId, parseMode(req.nextUrl.searchParams.get("mode")));
}
