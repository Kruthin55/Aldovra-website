#!/usr/bin/env python3
"""Refresh the ?v=<hash> cache-busting stamps for /assets/dashboard/* in dashboard.html.

Run after editing any file in assets/dashboard/:  python3 tools/stamp-dashboard-assets.py
Browsers cache these files, so the stamp must change whenever the content changes.
"""
import hashlib, re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html_path = root / "dashboard.html"
html = html_path.read_text(encoding="utf-8")

def stamp(m):
    name = m.group(1)
    digest = hashlib.sha1((root / "assets/dashboard" / name).read_bytes()).hexdigest()[:8]
    return f"/assets/dashboard/{name}?v={digest}"

new = re.sub(r"/assets/dashboard/([\w.-]+)(?:\?v=\w+)?", stamp, html)
if new != html:
    html_path.write_text(new, encoding="utf-8")
    print("dashboard.html stamps updated")
else:
    print("stamps already current")
