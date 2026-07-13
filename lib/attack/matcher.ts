import type {
  AttackTechnique,
  TechniqueCandidate,
  Alert,
} from "@/lib/triage/types";
import techniquesRaw from "@/data/attack-techniques.json";

const TECHNIQUES = techniquesRaw as AttackTechnique[];
const BY_ID = new Map(TECHNIQUES.map((t) => [t.id, t]));

/**
 * SOC-phrase → technique lexicon. Deliberately keys off the ALERT TEXT
 * (name, rules, categories) — NOT the ground-truth label — so the matcher
 * behaves the way it would on a real, unlabeled offense.
 */
const LEXICON: { pattern: RegExp; ids: string[]; weight: number }[] = [
  {
    pattern: /port scan|nmap|syn scan|sequential port|firewall den|recon/i,
    ids: ["T1046", "T1595", "T1590", "T1018"],
    weight: 6,
  },
  {
    pattern: /syn flood|udp (amplif|flood)|http (request )?flood|denial of service|\bdos\b|ddos/i,
    ids: ["T1498", "T1499"],
    weight: 6,
  },
  {
    pattern: /brute force|password spray|failed log|login failure|patator|credential/i,
    ids: ["T1110", "T1078"],
    weight: 6,
  },
  {
    pattern: /botnet|beacon|\bc2\b|command.?and.?control|known bad|malware/i,
    ids: ["T1071", "T1571", "T1105", "T1095", "T1568"],
    weight: 6,
  },
  {
    pattern: /lateral movement|\bsmb\b|admin share|reverse shell|meterpreter|remote service|psexec|winrm/i,
    ids: ["T1021", "T1570", "T1059", "T1219", "T1055"],
    weight: 6,
  },
  {
    pattern: /sql injection|\bxss\b|cross.?site|directory traversal|web app|web shell|public.?facing/i,
    ids: ["T1190", "T1505", "T1059"],
    weight: 6,
  },
  {
    pattern: /exfil|data (egress|transfer|loss)|dns tunnel|high entropy|outbound (data|transfer)/i,
    ids: ["T1048", "T1041", "T1567", "T1071"],
    weight: 6,
  },
];

const STOP = new Set([
  "the", "and", "for", "with", "from", "single", "detected", "against",
  "possible", "known", "over", "into", "host", "server",
]);

function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const tok of s.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []) {
    if (!STOP.has(tok)) out.add(tok);
  }
  return out;
}

function alertSignalText(alert: Alert): string {
  const o = alert.raw_details;
  return [
    alert.alert_name,
    alert.protocol,
    o.description,
    ...o.categories,
    ...o.rules,
  ].join(" ");
}

/**
 * Shortlist the most plausible ATT&CK techniques for an alert.
 * Combines a curated SOC-phrase lexicon with keyword/name overlap across the
 * full vendored technique set.
 */
export function matchTechniques(alert: Alert, maxN = 7): TechniqueCandidate[] {
  const text = alertSignalText(alert);
  const tokens = tokenize(text);
  const scores = new Map<string, number>();

  for (const { pattern, ids, weight } of LEXICON) {
    if (pattern.test(text)) {
      ids.forEach((id, i) =>
        scores.set(id, (scores.get(id) ?? 0) + weight - i * 0.5)
      );
    }
  }

  for (const t of TECHNIQUES) {
    let s = 0;
    for (const kw of t.keywords ?? []) if (tokens.has(kw)) s += 1;
    for (const nt of tokenize(t.name)) if (tokens.has(nt)) s += 1.5;
    if (s > 0) scores.set(t.id, (scores.get(t.id) ?? 0) + s);
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score, t: BY_ID.get(id) }))
    .filter((x): x is { id: string; score: number; t: AttackTechnique } => !!x.t)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxN)
    .map((x) => ({
      id: x.id,
      name: x.t.name,
      tactics: x.t.tactics,
      score: Math.round(x.score * 100) / 100,
    }));
}

export function getTechnique(id: string): AttackTechnique | undefined {
  return BY_ID.get(id);
}

export function allTechniques(): AttackTechnique[] {
  return TECHNIQUES;
}
