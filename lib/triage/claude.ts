import { analyzeStructured, buildPrompt } from "@/lib/ai-analyst";
import { getTechnique } from "@/lib/attack/matcher";
import {
  TriageResultSchema,
  type Alert,
  type TriageResult,
  type TechniqueCandidate,
  PRIORITY_LEVELS,
} from "./types";

const SYSTEM = `You are a Tier-1 SOC analyst triaging security alerts for a critical energy-infrastructure environment (IT + OT/SCADA). You are precise, calm, and evidence-driven. You escalate based on impact and asset criticality, and you never invent MITRE ATT&CK technique IDs — you select only from the shortlist provided. Respond with a single JSON object and nothing else.`;

function alertBlock(alert: Alert): string {
  const o = alert.raw_details;
  return JSON.stringify(
    {
      id: alert.id,
      alert_name: alert.alert_name,
      severity_raw: alert.severity_raw,
      src_ip: alert.src_ip,
      dest_ip: alert.dest_ip,
      protocol: alert.protocol,
      asset: alert.asset,
      qradar_offense: {
        magnitude: o.magnitude,
        severity: o.severity,
        credibility: o.credibility,
        relevance: o.relevance,
        source_network: o.source_network,
        destination_networks: o.destination_networks,
        event_count: o.event_count,
        flow_count: o.flow_count,
        categories: o.categories,
        rules: o.rules,
        dest_port: o.dest_port,
      },
    },
    null,
    2
  );
}

function candidateBlock(candidates: TechniqueCandidate[]): string {
  return candidates
    .map((c) => {
      const t = getTechnique(c.id);
      return `- ${c.id}  ${c.name}  [${c.tactics.join(", ")}]\n    ${t?.description ?? ""}`;
    })
    .join("\n");
}

/**
 * Live Claude triage. The ATT&CK shortlist is injected so the model justifies
 * against real technique IDs instead of hallucinating them.
 */
export async function claudeTriage(
  alert: Alert,
  candidates: TechniqueCandidate[]
): Promise<TriageResult> {
  const prompt = buildPrompt([
    {
      heading: "Alert (normalized QRadar offense)",
      body: alertBlock(alert),
    },
    {
      heading: "Candidate MITRE ATT&CK techniques (choose exactly one)",
      body:
        candidateBlock(candidates) ||
        "(none matched — set matched_technique.id to \"N/A\")",
    },
    {
      heading: "Task",
      body: `Triage this alert. Return a JSON object with EXACTLY these fields:
{
  "summary": "1-2 sentence plain-English explanation of what this alert likely represents",
  "matched_technique": {
    "id": "one technique ID from the shortlist above (or \\"N/A\\")",
    "name": "its name",
    "confidence": 0.0-1.0,
    "justification": "why this technique fits the alert evidence"
  },
  "priority": {
    "level": "one of ${PRIORITY_LEVELS.join(" | ")}",
    "reasoning": "why this priority, referencing magnitude, asset criticality, and network position"
  },
  "next_steps": ["3-5 concrete analyst actions"],
  "suggested_query": "a KQL-style hunting query using the alert's IPs/ports"
}
Weigh OT/SCADA assets and external sources as higher impact. Output JSON only.`,
    },
  ]);

  const { data } = await analyzeStructured<TriageResult>({
    system: SYSTEM,
    prompt,
    schema: TriageResultSchema,
    maxTokens: 1600,
  });
  return data;
}
