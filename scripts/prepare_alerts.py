#!/usr/bin/env python3
"""
prepare_alerts.py
-----------------
One-time data-prep for a REAL labeled IDS dataset (CICIDS2017 or UNSW-NB15).
The public demo is seeded by generate_demo_alerts.py, so this script is
optional: point it at a dataset you've downloaded and it produces a labeled
subset in the same alert schema.

Requires pandas:  pip install pandas

Usage:
    python3 scripts/prepare_alerts.py --dataset cicids2017 \
        --input /path/to/MachineLearningCVE/ --sample 40 --out data/prepared-alerts.json
    python3 scripts/prepare_alerts.py --dataset unsw-nb15 \
        --input /path/to/UNSW_NB15_training-set.csv --sample 40

Datasets:
  CICIDS2017 : https://www.unb.ca/cic/datasets/ids-2017.html
  UNSW-NB15  : https://research.unsw.edu.au/projects/unsw-nb15-dataset
"""

import argparse
import glob
import json
import os
import sys

try:
    import pandas as pd
except ImportError:
    sys.exit("pandas is required: pip install pandas")

# Map each dataset's native labels into our clean attack buckets.
CICIDS_MAP = {
    "BENIGN": "Benign/Low",
    "PortScan": "Port Scan",
    "DoS Hulk": "DoS/DDoS",
    "DoS GoldenEye": "DoS/DDoS",
    "DoS slowloris": "DoS/DDoS",
    "DoS Slowhttptest": "DoS/DDoS",
    "DDoS": "DoS/DDoS",
    "FTP-Patator": "Brute Force",
    "SSH-Patator": "Brute Force",
    "Bot": "Bot",
    "Infiltration": "Infiltration",
    "Heartbleed": "Web Attack",
    "Web Attack – Brute Force": "Web Attack",
    "Web Attack – XSS": "Web Attack",
    "Web Attack – Sql Injection": "Web Attack",
}

UNSW_MAP = {
    "Normal": "Benign/Low",
    "Reconnaissance": "Port Scan",
    "DoS": "DoS/DDoS",
    "Exploits": "Infiltration",
    "Backdoor": "Infiltration",
    "Backdoors": "Infiltration",
    "Shellcode": "Infiltration",
    "Worms": "Bot",
    "Fuzzers": "Web Attack",
    "Generic": "Web Attack",
    "Analysis": "Port Scan",
}


def _first_col(df, candidates):
    """Return the first column present (tolerant of leading spaces)."""
    norm = {c.strip().lower(): c for c in df.columns}
    for cand in candidates:
        key = cand.strip().lower()
        if key in norm:
            return norm[key]
    return None


def load_cicids(input_path):
    files = ([input_path] if input_path.endswith(".csv")
             else sorted(glob.glob(os.path.join(input_path, "*.csv"))))
    if not files:
        sys.exit(f"No CSV files found at {input_path}")
    frames = [pd.read_csv(f, low_memory=False) for f in files]
    return pd.concat(frames, ignore_index=True), CICIDS_MAP


def load_unsw(input_path):
    return pd.read_csv(input_path, low_memory=False), UNSW_MAP


def bucket_severity(label):
    return {
        "Benign/Low": 2, "Port Scan": 4, "Web Attack": 6, "Brute Force": 6,
        "Bot": 8, "DoS/DDoS": 8, "Infiltration": 9, "Data Exfiltration": 8,
    }.get(label, 5)


def to_alert(idx, row, df, label_col, native_label, bucket):
    src = _first_col(df, ["Source IP", "srcip", "src_ip", "id.orig_h"])
    dst = _first_col(df, ["Destination IP", "dstip", "dst_ip", "id.resp_h"])
    proto = _first_col(df, ["Protocol", "proto", "protocol_type"])
    dport = _first_col(df, ["Destination Port", "dsport", "dst_port"])
    sev = bucket_severity(bucket)

    src_ip = str(row[src]) if src else "203.0.113.10"
    dst_ip = str(row[dst]) if dst else "10.20.4.11"
    protocol = str(row[proto]).upper() if proto else "TCP"
    port = int(row[dport]) if dport and str(row[dport]).isdigit() else 443

    offense = {
        "offense_id": 9000 + idx,
        "description": f"{native_label} flow observed (dataset-derived)",
        "offense_type": "Source IP",
        "offense_source": src_ip,
        "magnitude": sev,
        "severity": sev,
        "credibility": 6,
        "relevance": sev,
        "status": "OPEN",
        "source_network": "external",
        "destination_networks": ["internal_corp"],
        "event_count": 1,
        "flow_count": 1,
        "start_time": "dataset-derived",
        "last_updated_time": "dataset-derived",
        "categories": [native_label],
        "rules": [f"Dataset label: {native_label}"],
        "assigned_to": None,
        "dest_port": port,
    }
    return {
        "id": f"DS-{9000 + idx}",
        "timestamp": "dataset-derived",
        "alert_name": f"{bucket} ({native_label})",
        "severity_raw": sev,
        "src_ip": src_ip,
        "dest_ip": dst_ip,
        "protocol": protocol,
        "asset": "dataset-host",
        "raw_details": offense,
        "ground_truth_label": bucket,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, choices=["cicids2017", "unsw-nb15"])
    ap.add_argument("--input", required=True, help="CSV file or directory")
    ap.add_argument("--sample", type=int, default=40, help="alerts per attack bucket cap")
    ap.add_argument("--out", default="data/prepared-alerts.json")
    args = ap.parse_args()

    df, label_map = (load_cicids(args.input) if args.dataset == "cicids2017"
                     else load_unsw(args.input))

    label_col = _first_col(df, ["Label", "attack_cat", " Label"])
    if not label_col:
        sys.exit("Could not find a label column in the dataset.")

    df[label_col] = df[label_col].astype(str).str.strip()
    df["_bucket"] = df[label_col].map(label_map)
    df = df.dropna(subset=["_bucket"])

    # Balanced sample: up to --sample rows per bucket.
    sampled = (df.groupby("_bucket", group_keys=False)
                 .apply(lambda g: g.sample(min(len(g), args.sample), random_state=42)))

    alerts = []
    for i, (_, row) in enumerate(sampled.iterrows()):
        alerts.append(to_alert(i, row, df, label_col,
                               row[label_col], row["_bucket"]))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(alerts, f, indent=2)

    print(f"Wrote {len(alerts)} alerts -> {args.out}")
    print(sampled["_bucket"].value_counts().to_string())


if __name__ == "__main__":
    main()
