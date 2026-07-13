import { matchTechniques } from "@/lib/attack/matcher";
import { heuristicTriage } from "./heuristic";
import { DEFAULT_MODEL } from "@/lib/ai-analyst";
import type { Alert, TriagedAlert } from "./types";

export type Engine = "heuristic" | "claude";

/**
 * The full triage pipeline for a single alert:
 *   1. shortlist ATT&CK techniques (matcher)
 *   2. run the chosen engine (heuristic default, or live Claude)
 *   3. return the alert + triage result, ready to persist/serve.
 */
export async function triageAlert(
  alert: Alert,
  engine: Engine = "heuristic"
): Promise<TriagedAlert> {
  const candidates = matchTechniques(alert, 7);

  let triage;
  let model: string | null = null;

  if (engine === "claude") {
    // Imported lazily so the heuristic path never pulls in the SDK.
    const { claudeTriage } = await import("./claude");
    triage = await claudeTriage(alert, candidates);
    model = DEFAULT_MODEL;
  } else {
    triage = heuristicTriage(alert, candidates);
  }

  return {
    ...alert,
    triage,
    candidates,
    engine,
    model,
    triaged_at: new Date().toISOString(),
  };
}
