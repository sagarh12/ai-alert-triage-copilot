import path from "path";
import fs from "fs";
import {
  TriagedAlertSchema,
  PRIORITY_LEVELS,
  type TriagedAlert,
  type PriorityLevel,
} from "@/lib/triage/types";

/**
 * App-side read layer. Reads the committed pipeline output
 * (data/triaged-alerts.json) — no database, no native module, no writable FS.
 * This is what makes the Vercel demo work read-only.
 */
const DATA_PATH = path.join(process.cwd(), "data", "triaged-alerts.json");

export const PRIORITY_ORDER: Record<PriorityLevel, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Informational: 4,
};

let _cache: TriagedAlert[] | null = null;

export function getAlerts(): TriagedAlert[] {
  if (_cache) return _cache;
  let raw: unknown = [];
  try {
    raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  } catch {
    return [];
  }
  const parsed = Array.isArray(raw) ? raw : [];
  const alerts = parsed
    .map((a) => {
      const r = TriagedAlertSchema.safeParse(a);
      return r.success ? r.data : null;
    })
    .filter((a): a is TriagedAlert => a !== null)
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.triage.priority.level] -
        PRIORITY_ORDER[b.triage.priority.level]
    );
  _cache = alerts;
  return alerts;
}

export function getAlert(id: string): TriagedAlert | undefined {
  return getAlerts().find((a) => a.id === id);
}

export function primaryTactic(a: TriagedAlert): string {
  return (
    a.candidates.find((c) => c.id === a.triage.matched_technique.id)?.tactics[0] ??
    a.candidates[0]?.tactics[0] ??
    "Unmapped"
  );
}

export type OverviewStats = {
  total: number;
  byPriority: { level: PriorityLevel; count: number }[];
  byTactic: { tactic: string; count: number }[];
  engine: string;
};

export function getStats(): OverviewStats {
  const alerts = getAlerts();
  const byPriority = PRIORITY_LEVELS.map((level) => ({
    level,
    count: alerts.filter((a) => a.triage.priority.level === level).length,
  }));

  const tacticCounts = new Map<string, number>();
  for (const a of alerts) {
    const t = primaryTactic(a);
    tacticCounts.set(t, (tacticCounts.get(t) ?? 0) + 1);
  }
  const byTactic = [...tacticCounts.entries()]
    .map(([tactic, count]) => ({ tactic, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: alerts.length,
    byPriority,
    byTactic,
    engine: alerts[0]?.engine ?? "heuristic",
  };
}

export function allTactics(): string[] {
  return [...new Set(getAlerts().map(primaryTactic))].sort();
}
