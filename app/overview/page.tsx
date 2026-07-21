import Link from "next/link";
import { getStats } from "@/lib/db/store";
import type { PriorityLevel } from "@/lib/triage/types";

export const dynamic = "force-static";

const PRIORITY_BAR: Record<PriorityLevel, string> = {
  Critical: "bg-crit",
  High: "bg-high",
  Medium: "bg-med",
  Low: "bg-low",
  Informational: "bg-info",
};

export default function OverviewPage() {
  const stats = getStats();
  const maxPriority = Math.max(1, ...stats.byPriority.map((p) => p.count));
  const maxTactic = Math.max(1, ...stats.byTactic.map((t) => t.count));

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight text-body">Overview</h1>
          <p className="mt-1 text-sm text-white/50">
            {stats.total} alerts triaged by the{" "}
            <span className="text-body/80">{stats.engine}</span> engine ·
            distribution by priority and MITRE ATT&CK tactic.
          </p>
        </div>
        <Link
          href="/"
          className="chip border-white/12 text-white/60 transition-colors hover:border-primary/30 hover:text-primary"
        >
          ← back to queue
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* priority distribution */}
        <section className="panel p-5">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-white/40">
            Priority distribution
          </h2>
          <div className="space-y-3">
            {stats.byPriority.map((p) => (
              <div key={p.level} className="flex items-center gap-3">
                <span className="w-24 shrink-0 font-mono text-[12.5px] text-body/70">{p.level}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-white/[0.04]">
                  <div
                    className={`h-full ${PRIORITY_BAR[p.level]} opacity-80`}
                    style={{ width: `${(p.count / maxPriority) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right font-mono text-[12.5px] text-white/60">{p.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* tactic breakdown */}
        <section className="panel p-5">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-white/40">
            By MITRE ATT&CK tactic
          </h2>
          <div className="space-y-3">
            {stats.byTactic.map((t) => (
              <div key={t.tactic} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate font-mono text-[12px] text-body/70" title={t.tactic}>
                  {t.tactic}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-white/[0.04]">
                  <div
                    className="h-full bg-secondary opacity-70"
                    style={{ width: `${(t.count / maxTactic) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right font-mono text-[12.5px] text-white/60">{t.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
