import type { PriorityLevel } from "@/lib/triage/types";

const PRIORITY_STYLE: Record<PriorityLevel, { text: string; border: string; bg: string; dot: string }> = {
  Critical: { text: "text-crit", border: "border-crit/40", bg: "bg-crit/10", dot: "bg-crit" },
  High: { text: "text-high", border: "border-high/40", bg: "bg-high/10", dot: "bg-high" },
  Medium: { text: "text-med", border: "border-med/40", bg: "bg-med/10", dot: "bg-med" },
  Low: { text: "text-low", border: "border-low/40", bg: "bg-low/10", dot: "bg-low" },
  Informational: { text: "text-info", border: "border-info/40", bg: "bg-info/10", dot: "bg-info" },
};

export function PriorityBadge({ level }: { level: PriorityLevel }) {
  const s = PRIORITY_STYLE[level];
  return (
    <span className={`chip gap-1.5 ${s.text} ${s.border} ${s.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {level}
    </span>
  );
}

export function TacticBadge({ tactic }: { tactic: string }) {
  return (
    <span className="chip border-secondary/25 bg-secondary/[0.06] text-secondary/90">
      {tactic}
    </span>
  );
}

export function TechniqueBadge({ id, name }: { id: string; name: string }) {
  return (
    <span className="chip gap-1.5 border-primary/25 bg-primary/[0.06] text-primary/90">
      <span className="font-semibold">{id}</span>
      <span className="text-primary/60">{name}</span>
    </span>
  );
}
