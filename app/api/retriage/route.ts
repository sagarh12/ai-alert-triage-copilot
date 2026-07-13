import { NextResponse } from "next/server";
import { getAlert } from "@/lib/db/store";
import { triageAlert } from "@/lib/triage/triageAlert";
import { hasApiKey } from "@/lib/ai-analyst";
import { AlertSchema } from "@/lib/triage/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live Claude re-triage of a single seeded alert. Server-side only — the API
 * key is read from the environment and never reaches the client. Returns 400
 * if no key is configured (the deployed demo ships heuristic results; add
 * ANTHROPIC_API_KEY in Vercel to enable this path).
 */
export async function POST(req: Request) {
  if (!hasApiKey()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured on the server." },
      { status: 400 }
    );
  }

  let id: string;
  try {
    ({ id } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const existing = getAlert(id);
  if (!existing) {
    return NextResponse.json({ error: `Unknown alert: ${id}` }, { status: 404 });
  }

  try {
    const alert = AlertSchema.parse(existing);
    const triaged = await triageAlert(alert, "claude");
    return NextResponse.json({ triage: triaged.triage, model: triaged.model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Triage failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
