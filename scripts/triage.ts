/**
 * Triage pipeline CLI.
 *
 *   npm run triage                 # heuristic engine (default, no key/cost)
 *   npm run triage -- --mode claude    # live Claude (needs ANTHROPIC_API_KEY)
 *   npm run triage -- --mode auto      # claude if a key is present, else heuristic
 *   npm run triage -- --input data/prepared-alerts.json --limit 20
 *
 * Reads seeded alerts → runs the ATT&CK matcher + triage engine → writes
 * SQLite (db/alerts.db) AND exports data/triaged-alerts.json (what the app serves).
 */
import fs from "fs";
import path from "path";
import { config } from "dotenv";
import { AlertSchema, type Alert } from "@/lib/triage/types";
import { triageAlert, type Engine } from "@/lib/triage/triageAlert";
import { heuristicTriage } from "@/lib/triage/heuristic";
import { matchTechniques } from "@/lib/attack/matcher";
import { hasApiKey, DEFAULT_MODEL } from "@/lib/ai-analyst";
import { openDb, upsertTriaged } from "@/lib/db/sqlite";
import type { TriagedAlert } from "@/lib/triage/types";

config({ path: ".env.local" });

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const input = arg("input", "data/demo-alerts.json")!;
  const out = arg("out", "data/triaged-alerts.json")!;
  const limit = parseInt(arg("limit", "0")!, 10);
  let mode = (arg("mode", process.env.AI_MODE || "heuristic") as Engine | "auto");

  if (mode === "auto") mode = hasApiKey() ? "claude" : "heuristic";
  if (mode === "claude" && !hasApiKey()) {
    console.error(
      "✗ --mode claude requires ANTHROPIC_API_KEY (set it in .env.local).\n" +
        "  Run with --mode heuristic for the free, offline engine."
    );
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(input, "utf-8")) as unknown[];
  let alerts: Alert[] = raw.map((a) => AlertSchema.parse(a));
  if (limit > 0) alerts = alerts.slice(0, limit);

  console.log(
    `\nTriaging ${alerts.length} alerts with the ${mode.toUpperCase()} engine` +
      (mode === "claude" ? ` (${DEFAULT_MODEL})` : "") +
      `\ninput: ${input}\n`
  );

  const db = openDb();
  const results: TriagedAlert[] = [];

  for (let i = 0; i < alerts.length; i++) {
    const alert = alerts[i];
    let triaged: TriagedAlert;
    try {
      triaged = await triageAlert(alert, mode);
    } catch (err) {
      // Robustness: if a live Claude call fails, fall back to heuristic for
      // this one alert so the pipeline still completes end-to-end.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ! ${alert.id} claude failed (${msg}) — using heuristic`);
      const candidates = matchTechniques(alert, 7);
      triaged = {
        ...alert,
        triage: heuristicTriage(alert, candidates),
        candidates,
        engine: "heuristic",
        model: null,
        triaged_at: new Date().toISOString(),
      };
    }
    upsertTriaged(db, triaged);
    results.push(triaged);
    const p = triaged.triage.priority.level.padEnd(13);
    const tech = triaged.triage.matched_technique.id.padEnd(6);
    console.log(
      `  [${String(i + 1).padStart(2)}/${alerts.length}] ${p} ${tech} ${alert.id}  ${alert.alert_name}`
    );
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  db.close();

  const byPriority = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.triage.priority.level] = (acc[r.triage.priority.level] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\n✓ Wrote ${results.length} triaged alerts → ${out}`);
  console.log(`  priority mix: ${JSON.stringify(byPriority)}`);
  console.log(`  SQLite: db/alerts.db\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
