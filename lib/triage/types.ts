import { z } from "zod";

/**
 * Domain types + Zod schemas for the alert-triage domain.
 * lib/ai-analyst stays generic; this file holds the alert-specific contract.
 */

export const PRIORITY_LEVELS = [
  "Critical",
  "High",
  "Medium",
  "Low",
  "Informational",
] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

/** MITRE ATT&CK Enterprise tactics (kill-chain phases). */
export const MITRE_TACTICS = [
  "Reconnaissance",
  "Resource Development",
  "Initial Access",
  "Execution",
  "Persistence",
  "Privilege Escalation",
  "Defense Evasion",
  "Credential Access",
  "Discovery",
  "Lateral Movement",
  "Collection",
  "Command and Control",
  "Exfiltration",
  "Impact",
] as const;
export type MitreTactic = (typeof MITRE_TACTICS)[number];

/** A single ATT&CK technique (vendored, trimmed from mitre/cti). */
export const AttackTechniqueSchema = z.object({
  id: z.string(), // e.g. "T1046"
  name: z.string(), // e.g. "Network Service Discovery"
  tactics: z.array(z.string()),
  description: z.string(),
  keywords: z.array(z.string()).optional(),
});
export type AttackTechnique = z.infer<typeof AttackTechniqueSchema>;

/**
 * QRadar-offense-style raw payload. Modeled close to real QRadar offense
 * fields so it reads like something out of the console I actually use.
 */
export const QRadarOffenseSchema = z.object({
  offense_id: z.number(),
  description: z.string(),
  offense_type: z.string(),
  offense_source: z.string(),
  magnitude: z.number(), // 1-10 (QRadar composite)
  severity: z.number(), // 1-10
  credibility: z.number(), // 1-10
  relevance: z.number(), // 1-10
  status: z.enum(["OPEN", "HIDDEN", "CLOSED"]),
  source_network: z.string(),
  destination_networks: z.array(z.string()),
  event_count: z.number(),
  flow_count: z.number(),
  start_time: z.string(),
  last_updated_time: z.string(),
  categories: z.array(z.string()),
  rules: z.array(z.string()),
  assigned_to: z.string().nullable(),
  dest_port: z.number(),
});
export type QRadarOffense = z.infer<typeof QRadarOffenseSchema>;

/** Clean, normalized alert schema (the ingest target). */
export const AlertSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  alert_name: z.string(),
  severity_raw: z.number(),
  src_ip: z.string(),
  dest_ip: z.string(),
  protocol: z.string(),
  asset: z.string(),
  raw_details: QRadarOffenseSchema,
  ground_truth_label: z.string(),
});
export type Alert = z.infer<typeof AlertSchema>;

/** The structured output every triage engine must return. */
export const TriageResultSchema = z.object({
  summary: z.string(),
  matched_technique: z.object({
    id: z.string(),
    name: z.string(),
    confidence: z.number().min(0).max(1),
    justification: z.string(),
  }),
  priority: z.object({
    level: z.enum(PRIORITY_LEVELS),
    reasoning: z.string(),
  }),
  next_steps: z.array(z.string()).min(1),
  suggested_query: z.string(),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

/** A shortlisted candidate technique produced by the matcher. */
export const TechniqueCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  tactics: z.array(z.string()),
  score: z.number(),
});
export type TechniqueCandidate = z.infer<typeof TechniqueCandidateSchema>;

/** Alert + its triage result, as persisted and served to the dashboard. */
export const TriagedAlertSchema = AlertSchema.extend({
  triage: TriageResultSchema,
  candidates: z.array(TechniqueCandidateSchema),
  engine: z.enum(["heuristic", "claude"]),
  model: z.string().nullable(),
  triaged_at: z.string(),
});
export type TriagedAlert = z.infer<typeof TriagedAlertSchema>;

export const ATTACK_CATEGORIES = [
  "Port Scan",
  "DoS/DDoS",
  "Brute Force",
  "Bot",
  "Infiltration",
  "Web Attack",
  "Data Exfiltration",
] as const;
export type AttackCategory = (typeof ATTACK_CATEGORIES)[number];
