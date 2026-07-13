import type {
  Alert,
  TriageResult,
  TechniqueCandidate,
  PriorityLevel,
} from "./types";

/**
 * Deterministic, rule-based triage engine. It mirrors the reasoning a junior
 * analyst applies before escalating: what is this, how bad is it (magnitude +
 * asset criticality), and what do I do next. It seeds the public demo with no
 * API key and no cost — the Claude engine (./claude.ts) is the richer path.
 *
 * It keys off the alert TEXT (name, rules, categories) — never the
 * ground-truth label — so it behaves like real, unlabeled triage.
 */

type Kind =
  | "Port Scan"
  | "DoS/DDoS"
  | "Brute Force"
  | "Bot"
  | "Infiltration"
  | "Web Attack"
  | "Data Exfiltration"
  | "Benign/Low";

function classify(alert: Alert): Kind {
  const t = `${alert.alert_name} ${alert.raw_details.rules.join(" ")} ${alert.raw_details.categories.join(" ")}`.toLowerCase();
  if (/scan|nmap|recon|firewall den/.test(t)) return "Port Scan";
  if (/flood|denial of service|\bdos\b|ddos/.test(t)) return "DoS/DDoS";
  if (/brute force|password spray|failed log|login failure/.test(t)) return "Brute Force";
  if (/botnet|beacon|\bc2\b|command.?and.?control/.test(t)) return "Bot";
  if (/lateral|reverse shell|meterpreter|admin share|smb/.test(t)) return "Infiltration";
  if (/sql injection|xss|traversal|web app|web shell/.test(t)) return "Web Attack";
  if (/exfil|tunnel|outbound (data|transfer)|egress|entropy/.test(t)) return "Data Exfiltration";
  return "Benign/Low";
}

const OT_ASSET = /scada|hmi|rtu|historian/i;

function priority(alert: Alert, kind: Kind): { level: PriorityLevel; reasoning: string } {
  const o = alert.raw_details;
  const factors: string[] = [];
  let score = o.magnitude; // QRadar composite, 1-10
  factors.push(`QRadar magnitude ${o.magnitude}/10`);

  if (o.severity >= 7) {
    score += 1.5;
    factors.push(`high severity (${o.severity}/10)`);
  }
  if (OT_ASSET.test(alert.asset)) {
    score += 2.5;
    factors.push(`targets OT/SCADA asset "${alert.asset}" (critical energy infrastructure)`);
  }
  if (o.source_network === "external") {
    score += 1;
    factors.push("source is external to the network");
  }
  if (o.credibility >= 7) {
    score += 0.5;
    factors.push(`credibility ${o.credibility}/10`);
  }
  if (kind === "Benign/Low") {
    score -= 5;
    factors.push("indicators are consistent with benign / policy-level activity");
  }
  if (kind === "Data Exfiltration" || kind === "Infiltration") {
    score += 1.5;
    factors.push(`${kind.toLowerCase()} pattern indicates likely post-compromise activity`);
  }

  let level: PriorityLevel;
  if (score >= 11) level = "Critical";
  else if (score >= 8) level = "High";
  else if (score >= 5) level = "Medium";
  else if (score >= 2.5) level = "Low";
  else level = "Informational";

  return {
    level,
    reasoning: `Scored ${level} based on: ${factors.join("; ")}.`,
  };
}

function summarize(alert: Alert, kind: Kind): string {
  const o = alert.raw_details;
  const dir = o.source_network === "external" ? "external source" : "internal host";
  return (
    `${kind === "Benign/Low" ? "Low-signal event" : `Likely ${kind.toLowerCase()}`}: ` +
    `${alert.alert_name} from ${dir} ${alert.src_ip} against ${alert.asset} (${alert.dest_ip}) ` +
    `over ${alert.protocol}, ${o.event_count.toLocaleString()} events observed.`
  );
}

const NEXT_STEPS: Record<Kind, string[]> = {
  "Port Scan": [
    "Confirm the scan scope: how many destination ports/hosts were touched by the source IP.",
    "Check whether any scanned port returned a SYN-ACK (successful connection) vs. all resets.",
    "Block or rate-limit the source IP at the perimeter if it is external and unrecognized.",
    "Search for follow-on activity from the same source (exploit attempts, logins).",
  ],
  "DoS/DDoS": [
    "Confirm impact: is the destination service degraded or still responsive?",
    "Identify whether traffic is from a single source or distributed; engage upstream/ISP scrubbing if distributed.",
    "Apply rate-limiting / SYN-cookie protections on the targeted service.",
    "Preserve NetFlow for the attack window for post-incident review.",
  ],
  "Brute Force": [
    "Identify the targeted account(s) and whether any authentication succeeded.",
    "If a login succeeded, treat as a confirmed compromise and reset credentials immediately.",
    "Enforce/verify account lockout and MFA on the targeted service.",
    "Block the source IP and hunt for the same source against other assets.",
  ],
  Bot: [
    "Validate the destination against threat intel (known C2 / botnet infrastructure).",
    "Isolate the internal host if beaconing is confirmed.",
    "Pull the process/parent-process responsible for the outbound connection from EDR.",
    "Check for lateral movement or additional beaconing from the same host.",
  ],
  Infiltration: [
    "Isolate the affected host(s) from the network immediately.",
    "Collect volatile data (running processes, network connections, logged-on users).",
    "Determine the initial access vector and scope of lateral movement.",
    "Reset credentials for any accounts used on the compromised host.",
  ],
  "Web Attack": [
    "Review the raw request payload and confirm whether the application was actually vulnerable.",
    "Check WAF/application logs for a successful response (200 with data) vs. blocked.",
    "Validate input handling on the targeted endpoint; block the source IP.",
    "Scan the web asset for web shells or unexpected file changes.",
  ],
  "Data Exfiltration": [
    "Quantify the outbound volume and destination reputation.",
    "Isolate the source host and preserve evidence if egress is confirmed.",
    "Identify what data the host had access to (data classification / DLP).",
    "For DNS tunneling, inspect query entropy and the resolving domain.",
  ],
  "Benign/Low": [
    "Verify against known-good baselines / expected user behavior.",
    "Confirm with the asset owner if unusual but plausibly legitimate.",
    "Document rationale and close, or tune the rule if noisy.",
  ],
};

function suggestedQuery(alert: Alert, kind: Kind): string {
  const src = alert.src_ip;
  const dst = alert.dest_ip;
  if (kind === "Brute Force") {
    return `SecurityEvent\n| where TimeGenerated > ago(24h)\n| where IpAddress == "${src}" and EventID in (4625, 4624)\n| summarize Failures=countif(EventID==4625), Successes=countif(EventID==4624) by Account, Computer`;
  }
  if (kind === "Bot" || kind === "Data Exfiltration") {
    return `CommonSecurityLog\n| where TimeGenerated > ago(24h)\n| where SourceIP == "${src}"\n| summarize Bytes=sum(SentBytes), Conns=count() by DestinationIP, DestinationPort\n| order by Bytes desc`;
  }
  if (kind === "Web Attack") {
    return `AppServiceHTTPLogs\n| where TimeGenerated > ago(24h)\n| where CIp == "${src}"\n| project TimeGenerated, CsMethod, CsUriStem, ScStatus, CsUriQuery`;
  }
  return `CommonSecurityLog\n| where TimeGenerated > ago(24h)\n| where SourceIP == "${src}" and DestinationIP == "${dst}"\n| summarize Events=count() by DestinationPort, Protocol\n| order by Events desc`;
}

export function heuristicTriage(
  alert: Alert,
  candidates: TechniqueCandidate[]
): TriageResult {
  const kind = classify(alert);
  const top = candidates[0];
  const confidence = top
    ? Math.max(0.4, Math.min(0.95, top.score / 12))
    : 0.25;

  return {
    summary: summarize(alert, kind),
    matched_technique: {
      id: top?.id ?? "N/A",
      name: top?.name ?? "Unmapped",
      confidence: Math.round(confidence * 100) / 100,
      justification: top
        ? `Alert indicators (${alert.alert_name}; rules: ${alert.raw_details.rules[0]}) overlap most strongly with ${top.id} ${top.name} among the ATT&CK shortlist.`
        : "No ATT&CK technique cleared the matching threshold for this alert.",
    },
    priority: priority(alert, kind),
    next_steps: NEXT_STEPS[kind],
    suggested_query: suggestedQuery(alert, kind),
  };
}
