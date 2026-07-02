import { NextResponse } from "next/server";

import { keyAvailable, modelName } from "@/lib/agent";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ keyAvailable: keyAvailable(), model: modelName() });
}
