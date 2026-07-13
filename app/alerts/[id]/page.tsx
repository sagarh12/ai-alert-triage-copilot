import Link from "next/link";
import { notFound } from "next/navigation";
import { getAlert, getAlerts, primaryTactic } from "@/lib/db/store";
import { PriorityBadge, TacticBadge, TechniqueBadge } from "@/components/badges";
import FeedbackControl from "@/components/FeedbackControl";

export const dynamic = "force-static";

export function generateStaticParams() {
  return getAlerts().map((a) => ({ id: a.id }));
}

export default function AlertDetail({ params }: { params: { id: string } }) {
  const alert = getAlert(params.id);
  if (!alert) notFound();

  const o = alert.raw_details;
  const t = alert.triage;

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <Link href="/" className="mb-4 inline-block font-mono text-xs text-white/40 hover:text-primary">
        ← back to queue
      </Link>

      {/* header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <PriorityBadge level={t.priority.level} />
            <span className="font-mono text-xs text-white/40">{alert.id}</span>
            <span className="chip border-white/10 text-white/40">
              engine: <span className="ml-1 text-primary">{alert.engine}</span>
              {alert.model ? <span className="ml-1 text-white/30">/ {alert.model}</span> : null}
            </span>
          </div>
          <h1 className="mt-2 font-mono text-xl font-bold tracking-tight text-body">
            {alert.alert_name}
          </h1>
        </div>
        <FeedbackControl id={alert.id} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* RAW ALERT */}
        <section className="panel p-5">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-white/40">
            Raw alert — normalized QRadar offense
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[12.5px]">
            <Field k="asset" v={alert.asset} accent />
            <Field k="protocol" v={`${alert.protocol} :${o.dest_port}`} />
            <Field k="src_ip" v={alert.src_ip} />
            <Field k="dest_ip" v={alert.dest_ip} />
            <Field k="magnitude" v={`${o.magnitude}/10`} />
            <Field k="severity" v={`${o.severity}/10`} />
            <Field k="credibility" v={`${o.credibility}/10`} />
            <Field k="relevance" v={`${o.relevance}/10`} />
            <Field k="src network" v={o.source_network} />
            <Field k="events / flows" v={`${o.event_count.toLocaleString()} / ${o.flow_count.toLocaleString()}`} />
          </dl>
          <div className="mt-4">
            <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-white/35">triggered rules</div>
            <ul className="space-y-1">
              {o.rules.map((r) => (
                <li key={r} className="font-mono text-[12px] text-body/70">▹ {r}</li>
              ))}
            </ul>
          </div>
          <details className="mt-4 group">
            <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-white/35 hover:text-white/60">
              full offense JSON
            </summary>
            <pre className="kql mt-2 text-white/70">{JSON.stringify(alert.raw_details, null, 2)}</pre>
          </details>
        </section>

        {/* AI TRIAGE */}
        <section className="panel border-primary/[0.14] p-5">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-primary/70">
            AI triage
          </h2>

          <p className="text-[14px] leading-relaxed text-body">{t.summary}</p>

          <Block title="MITRE ATT&CK">
            <div className="flex flex-wrap items-center gap-2">
              <TechniqueBadge id={t.matched_technique.id} name={t.matched_technique.name} />
              <TacticBadge tactic={primaryTactic(alert)} />
              <span className="font-mono text-[11px] text-white/40">
                confidence {(t.matched_technique.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-body/70">
              {t.matched_technique.justification}
            </p>
          </Block>

          <Block title={`Priority — ${t.priority.level}`}>
            <p className="text-[13px] leading-relaxed text-body/70">{t.priority.reasoning}</p>
          </Block>

          <Block title="Recommended next steps">
            <ol className="space-y-1.5">
              {t.next_steps.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-body/75">
                  <span className="font-mono text-primary/70">{i + 1}.</span>
                  {s}
                </li>
              ))}
            </ol>
          </Block>

          <Block title="Suggested hunting query (KQL)">
            <pre className="kql">{t.suggested_query}</pre>
          </Block>
        </section>
      </div>

      {/* ATT&CK shortlist */}
      <section className="panel mt-5 p-5">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-white/40">
          ATT&CK candidate shortlist{" "}
          <span className="text-white/25">— matched before the model was called, so it justifies from real technique IDs</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {alert.candidates.map((c) => (
            <span
              key={c.id}
              className={`chip gap-1.5 ${
                c.id === t.matched_technique.id
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-white/10 text-white/50"
              }`}
            >
              <span className="font-semibold">{c.id}</span>
              {c.name}
              <span className="text-white/30">·{c.score}</span>
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}

function Field({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10.5px] uppercase tracking-wider text-white/30">{k}</dt>
      <dd className={accent ? "text-primary/90" : "text-body/80"}>{v}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-white/[0.06] pt-4">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-white/40">{title}</div>
      {children}
    </div>
  );
}
