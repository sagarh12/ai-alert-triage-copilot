import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import type { TriagedAlert } from "@/lib/triage/types";

/**
 * SQLite persistence for the triage PIPELINE (scripts/triage.ts). The Next.js
 * app never imports this — it reads the exported JSON (lib/db/store.ts) so the
 * deploy has no native-module or writable-filesystem dependency.
 */
const DB_PATH = path.join(process.cwd(), "db", "alerts.db");

export function openDb(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS triaged_alerts (
      id           TEXT PRIMARY KEY,
      alert_name   TEXT NOT NULL,
      priority     TEXT NOT NULL,
      technique_id TEXT,
      tactic       TEXT,
      engine       TEXT NOT NULL,
      triaged_at   TEXT NOT NULL,
      data         TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_priority ON triaged_alerts(priority);
    CREATE INDEX IF NOT EXISTS idx_tactic   ON triaged_alerts(tactic);
  `);
  return db;
}

export function upsertTriaged(db: Database.Database, a: TriagedAlert): void {
  const tactic = a.candidates.find((c) => c.id === a.triage.matched_technique.id)
    ?.tactics[0] ?? a.candidates[0]?.tactics[0] ?? "Unmapped";
  db.prepare(
    `INSERT INTO triaged_alerts (id, alert_name, priority, technique_id, tactic, engine, triaged_at, data)
     VALUES (@id, @alert_name, @priority, @technique_id, @tactic, @engine, @triaged_at, @data)
     ON CONFLICT(id) DO UPDATE SET
       alert_name=@alert_name, priority=@priority, technique_id=@technique_id,
       tactic=@tactic, engine=@engine, triaged_at=@triaged_at, data=@data`
  ).run({
    id: a.id,
    alert_name: a.alert_name,
    priority: a.triage.priority.level,
    technique_id: a.triage.matched_technique.id,
    tactic,
    engine: a.engine,
    triaged_at: a.triaged_at,
    data: JSON.stringify(a),
  });
}

export function allTriaged(db: Database.Database): TriagedAlert[] {
  const rows = db
    .prepare(`SELECT data FROM triaged_alerts ORDER BY triaged_at DESC`)
    .all() as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as TriagedAlert);
}
