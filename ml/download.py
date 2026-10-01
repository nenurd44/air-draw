"""Bounded dataset download, usable before training packages are installed."""
import argparse
import json
from pathlib import Path
import urllib.request

CATEGORIES = ['circle', 'triangle', 'star', 'house', 'tree', 'fish', 'bicycle', 'umbrella', 'cup', 'airplane']
parser = argparse.ArgumentParser()
parser.add_argument('--per-category', type=int, default=2000)
args = parser.parse_args()
data = Path(__file__).resolve().parent / 'data'
data.mkdir(exist_ok=True)
for category in CATEGORIES:
    path = data / f'{category}.ndjson'
    if path.exists() and len(path.read_text().splitlines()) == args.per_category:
        print(f'{category}: cached', flush=True)
        continue
    rows, seen = [], set()
    with urllib.request.urlopen(f'https://storage.googleapis.com/quickdraw_dataset/full/simplified/{category}.ndjson', timeout=120) as response:
        for line in response:
            row = json.loads(line)
            if row['recognized'] and row['key_id'] not in seen:
                rows.append(row); seen.add(row['key_id'])
            if len(rows) >= args.per_category:
                break
    path.write_text('\n'.join(json.dumps(r, separators=(',', ':')) for r in rows), encoding='utf-8')
    print(f'{category}: {len(rows)} drawings, {path.stat().st_size/1024:.0f} KiB', flush=True)
