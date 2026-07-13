"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PriorityBadge, TacticBadge } from "./badges";
import { PRIORITY_LEVELS, type PriorityLevel } from "@/lib/triage/types";
import { statusOf, type Status } from "@/lib/feedback";

export type QueueRow = {
  id: string;
  alert_name: string;
  asset: string;
  src_ip: string;
  priority: PriorityLevel;
  technique_id: string;
  technique_name: string;
  tactic: string;
  summary: string;
  confidence: number;
};

const PRIORITY_ORDER = Object.fromEntries(PRIORITY_LEVELS.map((p, i) => [p, i]));

const STATUS_LABEL: Record<Status, string> = {
  unreviewed: "● unreviewed",
  agree: "▲ agreed",
  disagree: "▼ disagreed",
};
const STATUS_COLOR: Record<Status, string> = {
  unreviewed: "text-white/40",
  agree: "text-primary",
  disagree: "text-high",
};

export default function AlertQueue({
  rows,
  tactics,
}: {
  rows: QueueRow[];
  tactics: string[];
}) {
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<string>("all");
  const [tactic, setTactic] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<"priority" | "confidence">("priority");

  // Live status from localStorage feedback.
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  useEffect(() => {
    const refresh = () =>
      setStatuses(Object.fromEntries(rows.map((r) => [r.id, statusOf(r.id)])));
    refresh();
    window.addEventListener("atc:feedback", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("atc:feedback", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows
      .filter((r) => (priority === "all" ? true : r.priority === priority))
      .filter((r) => (tactic === "all" ? true : r.tactic === tactic))
      .filter((r) => (status === "all" ? true : (statuses[r.id] ?? "unreviewed") === status))
      .filter((r) =>
        query
          ? `${r.alert_name} ${r.asset} ${r.src_ip} ${r.technique_id} ${r.tactic}`
              .toLowerCase()
              .includes(query)
          : true
      )
      .sort((a, b) =>
        sort === "priority"
          ? PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
          : b.confidence - a.confidence
      );
  }, [rows, q, priority, tactic, status, sort, statuses]);

  return (
    <div>
      {/* controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search asset, IP, technique…"
          className="w-56 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-[13px] text-body outline-none placeholder:text-white/25 focus:border-primary/50"
        />
        <Select value={priority} onChange={setPriority} label="priority">
          <option value="all">all priorities</option>
          {PRIORITY_LEVELS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
        <Select value={tactic} onChange={setTactic} label="tactic">
          <option value="all">all tactics</option>
          {tactics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Select value={status} onChange={setStatus} label="status">
          <option value="all">all statuses</option>
          <option value="unreviewed">unreviewed</option>
          <option value="agree">agreed</option>
          <option value="disagree">disagreed</option>
        </Select>
        <Select value={sort} onChange={(v) => setSort(v as "priority" | "confidence")} label="sort">
          <option value="priority">sort: priority</option>
          <option value="confidence">sort: confidence</option>
        </Select>
        <span className="ml-auto font-mono text-xs text-white/40">
          {filtered.length} / {rows.length}
        </span>
      </div>

      {/* list */}
      <div className="panel overflow-hidden">
        <div className="hidden grid-cols-[110px_1fr_150px_130px_110px] gap-3 border-b border-white/[0.06] px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-white/35 md:grid">
          <span>priority</span>
          <span>alert</span>
          <span>ATT&CK</span>
          <span>asset</span>
          <span>status</span>
        </div>
        <ul>
          {filtered.map((r) => {
            const st = statuses[r.id] ?? "unreviewed";
            return (
              <li key={r.id} className="border-b border-white/[0.04] last:border-0">
                <Link
                  href={`/alerts/${r.id}`}
                  className="grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-white/[0.02] md:grid-cols-[110px_1fr_150px_130px_110px] md:items-center md:gap-3"
                >
                  <div><PriorityBadge level={r.priority} /></div>
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[13.5px] text-body">{r.alert_name}</div>
                    <div className="truncate text-[12px] text-white/45">{r.summary}</div>
                  </div>
                  <div className="font-mono text-[12px] text-body/75">
                    {r.technique_id}
                    <span className="block truncate text-[11px] text-white/35">{r.tactic}</span>
                  </div>
                  <div className="truncate font-mono text-[12px] text-white/55">{r.asset}</div>
                  <div className={`font-mono text-[11px] ${STATUS_COLOR[st]}`}>{STATUS_LABEL[st]}</div>
                </Link>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-4 py-10 text-center font-mono text-sm text-white/40">
              no alerts match these filters
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-[12.5px] text-white/70 outline-none focus:border-primary/50"
    >
      {children}
    </select>
  );
}
