#!/usr/bin/env python3
"""Regenerate data/ndgain.json from the official ND-GAIN country index ZIP.

One-time build step, not needed at runtime (the browser reads the JSON).
Usage: python3 build_ndgain.py [ndgain_countryindex_2026.zip]
"""
import csv, io, json, sys, zipfile
from datetime import date, datetime, timezone
from pathlib import Path
import urllib.request

ZIP_URL = "https://gain.nd.edu/assets/647440/ndgain_countryindex_2026.zip"
OUT = Path(__file__).resolve().parent / "data" / "ndgain.json"


def load_zip_bytes():
    if len(sys.argv) > 1:
        return Path(sys.argv[1]).read_bytes()
    req = urllib.request.Request(ZIP_URL, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 Chrome/126.0 Safari/537.36"})
    return urllib.request.urlopen(req, timeout=120).read()


def main():
    zf = zipfile.ZipFile(io.BytesIO(load_zip_bytes()))
    name = next(n for n in zf.namelist()
                if n.endswith("gain/gain.csv") and "__MACOSX" not in n)
    text = zf.read(name).decode("utf-8", errors="replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    years = [c for c in rows[0].keys() if c.isdigit()]
    latest = max(years)
    valid = [r for r in rows if r.get(latest) not in (None, "", "NA")]
    scores = sorted((float(r[latest]) for r in valid), reverse=True)
    countries = {}
    for r in valid:
        score = float(r[latest])
        countries[r["ISO3"]] = {
            "score": round(score, 1),
            "rank": scores.index(score) + 1,  # 1 = highest score (most ready)
        }
    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "source": "ND-GAIN Country Index, " + ZIP_URL,
        "latest_year": int(latest),
        "count": len(countries),
        "note": "higher score = less vulnerable / more ready; rank 1 = highest score; "
                "countries with equal scores share the same rank",
        "countries": countries,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print("wrote %s: %d countries, year %s" % (OUT, len(countries), latest))


if __name__ == "__main__":
    main()
