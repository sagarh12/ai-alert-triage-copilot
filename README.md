# AI Alert Triage Copilot

> AI-assisted SOC alert triage — plain-English summaries, MITRE ATT&CK mapping, priority reasoning, recommended next steps, and a hunting query for every alert. A companion project to [sagarpreethooda.com](https://sagarpreethooda.com).

## Why I built this

I've spent three co-op terms doing SIEM log analysis and threat triage on **IBM QRadar** for critical energy infrastructure. A huge part of Tier-1 work is the same loop, over and over: read a raw offense, figure out *what* it is, map it to a technique, decide *how bad* it is given the asset it hit, and write up the next steps and a hunting query. It's judgment-heavy but highly patterned — exactly the layer worth automating.

This tool takes a raw security alert and does that first pass automatically: it summarizes the alert in plain English, grounds it to a real **MITRE ATT&CK** technique, assigns a priority *with reasoning*, recommends next steps, and drafts a KQL-style hunting query — then presents it as a queue an analyst can review, filter, and give thumbs-up/down feedback on. It's not a chatbot; it's the triage layer of a SOC, automated with Claude.

## What it does

- **Ingests raw alerts** shaped like real QRadar offense objects (magnitude, severity, credibility, relevance, rules, categories, source/destination networks).
- **Grounds to ATT&CK before calling the model:** a lightweight matcher shortlists the 5–8 most plausible techniques from a vendored copy of the Enterprise ATT&CK catalog, and that shortlist is injected into the prompt — so the model *picks and justifies from real technique IDs* instead of inventing them.
- **Triages each alert** into clean structured JSON: `summary`, `matched_technique {id, name, confidence, justification}`, `priority {level, reasoning}`, `next_steps[]`, `suggested_query`.
- **Dashboard** to work the queue like a junior analyst: sort/filter by priority, ATT&CK tactic, and review status; a detail view with the raw offense and full AI reasoning side by side; an overview of priority and tactic distribution; and per-alert thumbs-up/down feedback (human-in-the-loop).

## Architecture

```
┌─ Data layer (Python) ─────────────┐      ┌─ Pipeline (Node/tsx) ──────────────┐
│ generate_demo_alerts.py  ─┐       │      │ scripts/triage.ts                  │
│   synthetic QRadar offenses│       │      │   matcher → engine → SQLite + JSON │
│ prepare_alerts.py  ───────┴─► data/*.json ──► lib/attack/matcher (ATT&CK shortlist)
│   (CICIDS2017 / UNSW-NB15) │       │      │      → lib/triage engine:          │
└───────────────────────────┘       │      │          • heuristic (default)     │
                                     │      │          • Claude (lib/ai-analyst) │
data/attack-techniques.json ────────┘      │   → data/triaged-alerts.json       │
   (vendored from mitre/cti)                └──────────────┬─────────────────────┘
                                                           │ committed JSON
                                            ┌──────────────▼─────────────────────┐
                                            │ Next.js 14 app (reads JSON)         │
                                            │   /  queue   /alerts/[id]  /overview│
                                            │   /api/retriage (live Claude)       │
                                            └─────────────────────────────────────┘
```

**Two triage engines, one interface.** `lib/triage` exposes a heuristic engine (deterministic rules + templates — free, offline, and what seeds the public demo) and a Claude engine. They're interchangeable behind `triageAlert(alert, engine)`.

**`lib/ai-analyst` is deliberately generic** — the Claude call wrapper, prompt-template helper, and JSON-schema validation aren't hard-coded to "alerts." It's built to be reused (I'm lifting it into an Azure security tool next).

**Storage is split for a clean deploy.** The pipeline writes SQLite (`better-sqlite3`); the Next.js app reads the committed `data/triaged-alerts.json`, so the Vercel demo runs with zero database infrastructure and no writable-filesystem dependency. Analyst feedback persists in the browser (`localStorage`).

**The API key never touches the client.** All Claude calls run server-side (`lib/ai-analyst` refuses to load in a browser bundle); `ANTHROPIC_API_KEY` is read only from the environment.

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind · Zod · `better-sqlite3` · `@anthropic-ai/sdk` (default model `claude-opus-4-8`) · Python 3 + pandas (one-time data prep). Deploy-ready for Vercel.

## Setup & run

```bash
npm install

# 1. Seed synthetic QRadar-style alerts (stdlib only, no pip needed)
npm run seed

# 2. (optional) refresh the vendored MITRE ATT&CK catalog from mitre/cti
python3 scripts/vendor_attack.py

# 3. Triage the alerts end-to-end
npm run triage                 # heuristic engine — free, offline (seeds the demo)
#   OR, with a key in .env.local:
npm run triage -- --mode claude    # real Claude triage

# 4. Run the dashboard
npm run dev                    # http://localhost:3000
```

To use the live Claude engine, copy `.env.example` → `.env.local` and set `ANTHROPIC_API_KEY`. `npm run pipeline` runs seed + triage in one step.

### Using a real dataset (optional)

The public demo is seeded by the synthetic generator so it never depends on hosting a large dataset. To triage a real labeled set, download **CICIDS2017** or **UNSW-NB15** and point the prep script at it:

```bash
pip install pandas
python3 scripts/prepare_alerts.py --dataset cicids2017 --input /path/to/MachineLearningCVE/ --out data/prepared-alerts.json
npm run triage -- --input data/prepared-alerts.json
```

## Screenshots

_(to be added)_

- Triage queue —
- Alert detail (raw offense + AI reasoning + ATT&CK shortlist) —
- Overview (priority + tactic distribution) —

## What I'd build next

- **Live SIEM connector** — pull real offenses from the QRadar / Microsoft Sentinel APIs instead of seeded data (deliberately out of scope for v1).
- **Feedback loop** — use the thumbs-up/down signal to build an eval set and measure triage quality over time (precision on priority, ATT&CK accuracy vs. ground-truth labels).
- **Analyst chat** — let an analyst ask follow-up questions about an alert and pivot into related events, using `lib/ai-analyst` as the backend.
- **Auto-enrichment** — resolve IP reputation / asset criticality from a CMDB before triage so priority reasoning is even better grounded.
- **Embedding-based ATT&CK matching** — swap keyword overlap for embeddings to improve the candidate shortlist on noisier alerts.

---

MITRE ATT&CK® is a registered trademark of The MITRE Corporation. Technique data is vendored from the public [mitre/cti](https://github.com/mitre/cti) repository.
