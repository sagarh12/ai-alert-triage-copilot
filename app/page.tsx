import Link from "next/link";
import AlertQueue, { type QueueRow } from "@/components/AlertQueue";
import { getAlerts, getStats, primaryTactic, allTactics } from "@/lib/db/store";

export const dynamic = "force-static";

export default function QueuePage() {
  const alerts = getAlerts();
  const stats = getStats();

  const rows: QueueRow[] = alerts.map((a) => ({
    id: a.id,
    alert_name: a.alert_name,
    asset: a.asset,
    src_ip: a.src_ip,
    priority: a.triage.priority.level,
    technique_id: a.triage.matched_technique.id,
    technique_name: a.triage.matched_technique.name,
    tactic: primaryTactic(a),
    summary: a.triage.summary,
    confidence: a.triage.matched_technique.confidence,
  }));

  const critical = stats.byPriority.find((p) => p.level === "Critical")?.count ?? 0;
  const high = stats.byPriority.find((p) => p.level === "High")?.count ?? 0;

  return (
    <main className="grid-texture">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl font-bold tracking-tight text-body">
              Triage Queue
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-white/50">
              Raw security alerts, triaged by AI: ATT&CK mapping, priority with reasoning,
              recommended next steps, and a hunting query. Reviewed like a junior analyst&apos;s queue.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="chip border-white/10 text-white/50">
              engine: <span className="ml-1 text-body/80">{stats.engine}</span>
            </span>
            <Link
              href="/overview"
              className="chip border-white/12 text-white/60 transition-colors hover:border-primary/30 hover:text-primary"
            >
              view overview →
            </Link>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Alerts triaged" value={stats.total} />
          <Stat label="Critical" value={critical} accent="text-crit" />
          <Stat label="High" value={high} accent="text-high" />
          <Stat label="ATT&CK tactics" value={stats.byTactic.length} />
        </div>

        {alerts.length === 0 ? (
          <div className="panel px-4 py-12 text-center font-mono text-sm text-white/50">
            No triaged alerts found. Run the pipeline: <code className="text-body">npm run pipeline</code>
          </div>
        ) : (
          <AlertQueue rows={rows} tactics={allTactics()} />
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, accent = "text-body" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="panel px-4 py-3.5">
      <div className={`font-mono text-2xl font-bold ${accent}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}
