#!/usr/bin/env python3
"""
vendor_attack.py
----------------
Downloads the MITRE ATT&CK Enterprise STIX bundle from the public CTI repo and
trims it to a compact technique list the matcher + prompt can use:
    { id, name, tactics[], description, keywords[] }

The 47MB source bundle is NOT committed; the trimmed output IS
(data/attack-techniques.json). Re-run to refresh against upstream ATT&CK.

stdlib only.

Usage:
    python3 scripts/vendor_attack.py --out data/attack-techniques.json
"""

import argparse
import json
import os
import re
import sys
import urllib.request

CTI_URL = ("https://raw.githubusercontent.com/mitre/cti/master/"
           "enterprise-attack/enterprise-attack.json")

STOPWORDS = set("""
the a an and or of to for with from into over via using use used may can that this
these those which who whom whose it its their they them then than such as at by on in
is are be been being also other more most many some any all not no non was were will
would could should system systems access data via user users network networks target
adversary adversaries technique techniques attacker information one two example e g i e
""".split())


def tactic_title(phase_name: str) -> str:
    t = phase_name.replace("-", " ").title()
    return t.replace(" And ", " and ")


def keywords_from(name: str, description: str, limit: int = 22):
    text = f"{name} {name} {description}".lower()
    tokens = re.findall(r"[a-z][a-z0-9\-]{2,}", text)
    seen, out = set(), []
    for tok in tokens:
        tok = tok.strip("-")
        if len(tok) < 3 or tok in STOPWORDS or tok in seen:
            continue
        seen.add(tok)
        out.append(tok)
        if len(out) >= limit:
            break
    return out


def short_desc(description: str, max_len: int = 320) -> str:
    # First 1-2 sentences, stripped of markdown citations like (Citation: ...).
    d = re.sub(r"\(Citation:.*?\)", "", description or "")
    d = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", d)  # markdown links -> text
    d = " ".join(d.split())
    if len(d) <= max_len:
        return d
    cut = d[:max_len]
    return cut[: cut.rfind(".") + 1] if "." in cut else cut + "..."


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/attack-techniques.json")
    ap.add_argument("--url", default=CTI_URL)
    args = ap.parse_args()

    print(f"Downloading ATT&CK bundle (~47MB) from {args.url} ...")
    try:
        with urllib.request.urlopen(args.url, timeout=120) as resp:
            bundle = json.loads(resp.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        sys.exit(f"Download/parse failed: {e}")

    techniques = []
    for obj in bundle.get("objects", []):
        if obj.get("type") != "attack-pattern":
            continue
        if obj.get("x_mitre_deprecated") or obj.get("revoked"):
            continue

        ext_id = None
        for ref in obj.get("external_references", []):
            if ref.get("source_name") == "mitre-attack" and ref.get("external_id"):
                ext_id = ref["external_id"]
                break
        if not ext_id:
            continue

        tactics = [tactic_title(p["phase_name"])
                   for p in obj.get("kill_chain_phases", [])
                   if p.get("kill_chain_name") == "mitre-attack"]
        name = obj.get("name", "")
        desc = short_desc(obj.get("description", ""))

        techniques.append({
            "id": ext_id,
            "name": name,
            "tactics": tactics,
            "description": desc,
            "keywords": keywords_from(name, obj.get("description", "")),
        })

    techniques.sort(key=lambda t: t["id"])
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(techniques, f, indent=1)
    print(f"Wrote {len(techniques)} techniques -> {args.out}")


if __name__ == "__main__":
    main()
