#!/usr/bin/env python3
"""
generate_demo_alerts.py
-----------------------
Fabricates realistic QRadar-style offense objects and normalizes them into the
clean alert schema the app ingests. This seeds the public demo so it never
depends on shipping a multi-GB dataset.

Assets are deliberately energy-infrastructure / OT flavored (SCADA historians,
HMIs, RTU gateways) to match the SOC environment this tool is modeled on.

stdlib only — no pip install required.

Usage:
    python3 scripts/generate_demo_alerts.py --count 18 --seed 42 \
        --out data/demo-alerts.json
"""

import argparse
import ipaddress
import json
import os
import random
from datetime import datetime, timedelta, timezone

# Internal assets (destinations). Mix of IT + OT to reflect a utility SOC.
ASSETS = [
    ("web-prod-01", "10.20.4.11"),
    ("vpn-gw-01", "10.20.1.2"),
    ("dc-01-domain-controller", "10.20.2.10"),
    ("file-srv-02", "10.20.4.30"),
    ("jump-host-01", "10.20.1.55"),
    ("scada-historian-01", "10.50.3.10"),
    ("hmi-station-03", "10.50.3.44"),
    ("rtu-gw-07", "10.50.9.7"),
    ("billing-app-01", "10.20.6.21"),
    ("mail-relay-01", "10.20.5.9"),
]

# QRadar high/medium level categories (low-level cat names live in rules).
CATEGORY_POOL = {
    "recon": ["Reconnaissance", "Suspicious Activity"],
    "dos": ["Denial of Service", "Network DoS Attack"],
    "auth": ["Authentication", "User Login Failure"],
    "malware": ["Malware", "Botnet Communication"],
    "exploit": ["Exploit", "Web Application Attack"],
    "exfil": ["Data Transfer", "Potential Data Loss/Theft"],
    "recon_low": ["Recon", "Information Gathering"],
}

# Attack profiles keyed by ground-truth label.
PROFILES = [
    {
        "label": "Port Scan",
        "names": [
            "Horizontal Port Scan Detected",
            "Nmap SYN Scan From Single Host",
            "Rapid Sequential Port Connections",
        ],
        "protocol": "TCP",
        "dest_ports": [22, 80, 135, 139, 443, 445, 3389],
        "rules": ["Recon: Excessive Firewall Denies From Single Host",
                  "Recon: Port Scan Detected"],
        "categories": "recon",
        "offense_type": "Source IP",
        "magnitude": (3, 5), "severity": (3, 5),
        "credibility": (5, 8), "relevance": (3, 6),
        "events": (400, 3000), "flows": (400, 3000),
        "external_src": True,
    },
    {
        "label": "DoS/DDoS",
        "names": ["SYN Flood Detected", "UDP Amplification Flood",
                  "HTTP Request Flood Against Web Tier"],
        "protocol": "TCP",
        "dest_ports": [80, 443, 53],
        "rules": ["DoS: Possible Network DoS Detected",
                  "DoS: SYN Flood Against Single Destination"],
        "categories": "dos",
        "offense_type": "Destination IP",
        "magnitude": (6, 8), "severity": (6, 9),
        "credibility": (6, 9), "relevance": (6, 9),
        "events": (50000, 400000), "flows": (20000, 150000),
        "external_src": True,
    },
    {
        "label": "Brute Force",
        "names": ["SSH Brute Force Against Server",
                  "RDP Failed Logins Threshold Exceeded",
                  "VPN Password Spray Detected"],
        "protocol": "TCP",
        "dest_ports": [22, 3389, 443],
        "rules": ["Auth: Multiple Login Failures From Single Source",
                  "Auth: Brute Force Login Attempt"],
        "categories": "auth",
        "offense_type": "Source IP",
        "magnitude": (5, 7), "severity": (5, 7),
        "credibility": (6, 9), "relevance": (5, 8),
        "events": (200, 5000), "flows": (200, 5000),
        "external_src": True,
    },
    {
        "label": "Bot",
        "names": ["Botnet C2 Beacon Detected",
                  "Communication With Known Botnet IP",
                  "Periodic Outbound Beaconing (Possible C2)"],
        "protocol": "TCP",
        "dest_ports": [443, 8080, 6667],
        "rules": ["Malware: Outbound Connection To Known C2",
                  "Anomaly: Regular Beaconing Interval Detected"],
        "categories": "malware",
        "offense_type": "Source IP",
        "magnitude": (6, 9), "severity": (6, 9),
        "credibility": (7, 9), "relevance": (7, 9),
        "events": (100, 2000), "flows": (100, 2000),
        "external_src": False,
    },
    {
        "label": "Infiltration",
        "names": ["Suspected Lateral Movement (SMB)",
                  "Meterpreter Reverse Shell Pattern",
                  "Unusual Admin Share Access Across Hosts"],
        "protocol": "TCP",
        "dest_ports": [445, 4444, 5985],
        "rules": ["Anomaly: Internal Host Scanning Peers",
                  "Malware: Reverse Shell Signature Match"],
        "categories": "malware",
        "offense_type": "Source IP",
        "magnitude": (7, 9), "severity": (7, 10),
        "credibility": (6, 8), "relevance": (7, 10),
        "events": (50, 800), "flows": (50, 800),
        "external_src": False,
    },
    {
        "label": "Web Attack",
        "names": ["SQL Injection Attempt On Web App",
                  "Reflected XSS Payload Detected",
                  "Directory Traversal Against Web Server"],
        "protocol": "HTTP",
        "dest_ports": [80, 443],
        "rules": ["Web: SQL Injection Signature Match",
                  "Web: Malicious Request Pattern"],
        "categories": "exploit",
        "offense_type": "Source IP",
        "magnitude": (5, 7), "severity": (5, 8),
        "credibility": (6, 8), "relevance": (5, 8),
        "events": (20, 400), "flows": (20, 400),
        "external_src": True,
    },
    {
        "label": "Data Exfiltration",
        "names": ["Large Outbound Transfer To Rare Destination",
                  "Possible DNS Tunneling Detected",
                  "Sensitive Data Egress Over HTTPS"],
        "protocol": "DNS",
        "dest_ports": [53, 443],
        "rules": ["Exfil: Abnormal Outbound Data Volume",
                  "Exfil: High Entropy DNS Queries"],
        "categories": "exfil",
        "offense_type": "Source IP",
        "magnitude": (7, 9), "severity": (7, 9),
        "credibility": (5, 8), "relevance": (7, 10),
        "events": (300, 9000), "flows": (300, 9000),
        "external_src": False,
    },
    # Lower-signal / likely-benign to give the triage engine easy calls too.
    {
        "label": "Benign/Low",
        "names": ["Single User Multiple Failed Logins (Typo)",
                  "Expired Certificate Warning",
                  "Policy Violation: Unapproved Cloud Storage"],
        "protocol": "TCP",
        "dest_ports": [443, 80],
        "rules": ["Auth: Repeated Failures Single Account",
                  "Policy: Acceptable Use Violation"],
        "categories": "recon_low",
        "offense_type": "Source IP",
        "magnitude": (1, 3), "severity": (1, 3),
        "credibility": (3, 6), "relevance": (1, 3),
        "events": (3, 40), "flows": (3, 40),
        "external_src": False,
    },
]


def rand_external_ip(rng):
    # Avoid private ranges for external attackers.
    while True:
        ip = ipaddress.IPv4Address(rng.randint(0x01000000, 0xDF000000))
        if not (ip.is_private or ip.is_reserved or ip.is_multicast
                or ip.is_loopback):
            return str(ip)


def rand_internal_ip(rng):
    return f"10.{rng.randint(20, 50)}.{rng.randint(1, 9)}.{rng.randint(2, 250)}"


def build_alert(idx, profile, rng, base_time):
    asset_name, asset_ip = rng.choice(ASSETS)
    src_ip = rand_external_ip(rng) if profile["external_src"] else rand_internal_ip(rng)
    dest_ip = asset_ip
    protocol = profile["protocol"]
    port = rng.choice(profile["dest_ports"])
    name = rng.choice(profile["names"])

    magnitude = rng.randint(*profile["magnitude"])
    severity = rng.randint(*profile["severity"])
    credibility = rng.randint(*profile["credibility"])
    relevance = rng.randint(*profile["relevance"])
    events = rng.randint(*profile["events"])
    flows = rng.randint(*profile["flows"])

    start = base_time - timedelta(minutes=rng.randint(1, 720))
    last = start + timedelta(minutes=rng.randint(1, 90))

    offense = {
        "offense_id": 4200 + idx,
        "description": f"{name} :: {profile['label']} targeting {asset_name}",
        "offense_type": profile["offense_type"],
        "offense_source": src_ip,
        "magnitude": magnitude,
        "severity": severity,
        "credibility": credibility,
        "relevance": relevance,
        "status": "OPEN",
        "source_network": "external" if profile["external_src"] else "internal_corp",
        "destination_networks": [
            "ot_scada" if asset_ip.startswith("10.50") else "internal_corp"
        ],
        "event_count": events,
        "flow_count": flows,
        "start_time": start.isoformat(),
        "last_updated_time": last.isoformat(),
        "categories": CATEGORY_POOL[profile["categories"]],
        "rules": profile["rules"],
        "assigned_to": None,
        "dest_port": port,
    }

    return {
        "id": f"ALERT-{4200 + idx}",
        "timestamp": start.isoformat(),
        "alert_name": name,
        "severity_raw": severity,
        "src_ip": src_ip,
        "dest_ip": dest_ip,
        "protocol": protocol,
        "asset": asset_name,
        "raw_details": offense,
        "ground_truth_label": profile["label"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=18)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="data/demo-alerts.json")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    base_time = datetime(2025, 11, 3, 14, 0, tzinfo=timezone.utc)

    # Ensure coverage: one of each profile first, then random fill.
    order = list(PROFILES)
    rng.shuffle(order)
    alerts = []
    for i in range(args.count):
        profile = order[i] if i < len(order) else rng.choice(PROFILES)
        alerts.append(build_alert(i, profile, rng, base_time))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(alerts, f, indent=2)

    by_label = {}
    for a in alerts:
        by_label[a["ground_truth_label"]] = by_label.get(a["ground_truth_label"], 0) + 1
    print(f"Wrote {len(alerts)} alerts -> {args.out}")
    print("Breakdown by ground-truth label:")
    for label, n in sorted(by_label.items()):
        print(f"  {label:18} {n}")


if __name__ == "__main__":
    main()
