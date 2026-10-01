"""Stream a bounded prefix per category; split source IDs BEFORE augmentation."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import numpy as np
from common import CATEGORIES, rasterize, prefix

ROOT = Path(__file__).resolve().parent

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--per-category', type=int, default=2000)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    data = ROOT / 'data'
    data.mkdir(exist_ok=True)
    rng = np.random.default_rng(args.seed)
    buckets = {s: ([], []) for s in ['train', 'val', 'test', 'test_partial']}
    manifest = {'seed': args.seed, 'per_category': args.per_category, 'source': 'Google Quick, Draw! simplified NDJSON', 'sampling': 'first N recognized unique source IDs; bounded convenience sample', 'license': 'CC BY 4.0', 'splits': {s: [] for s in ['train', 'val', 'test']}, 'sha256': {}}
    fixtures = []
    for label, category in enumerate(CATEGORIES):
        path = data / f'{category}.ndjson'
        rows = []
        if path.exists():
            rows = [json.loads(line) for line in path.read_text().splitlines()]
        if len(rows) != args.per_category:
            rows, seen = [], set()
            url = f'https://storage.googleapis.com/quickdraw_dataset/full/simplified/{category}.ndjson'
            with urllib.request.urlopen(url, timeout=60) as response:
                for line in response:
                    row = json.loads(line)
                    if row['recognized'] and row['key_id'] not in seen:
                        rows.append(row)
                        seen.add(row['key_id'])
                    if len(rows) >= args.per_category:
                        break
            path.write_text('\n'.join(json.dumps(r, separators=(',', ':')) for r in rows), encoding='utf-8')
        manifest['sha256'][category] = hashlib.sha256(path.read_bytes()).hexdigest()
        order = rng.permutation(len(rows))
        for rank, idx in enumerate(order):
            row = rows[idx]
            split = 'train' if rank < int(len(rows)*.8) else 'val' if rank < int(len(rows)*.9) else 'test'
            manifest['splits'][split].append(row['key_id'])
            strokes = [list(map(list, zip(s[0], s[1]))) for s in row['drawing']]
            fractions = [1.0, float(rng.uniform(.45, .95))] if split == 'train' else [1.0]
            for fraction in fractions:
                buckets[split][0].append(rasterize(prefix(strokes, fraction)))
                buckets[split][1].append(label)
            if split == 'test':
                buckets['test_partial'][0].append(rasterize(prefix(strokes, .65)))
                buckets['test_partial'][1].append(label)
                if len(fixtures) <= label:
                    fixtures.append({'category': category, 'strokes': strokes, 'pixels': rasterize(strokes).ravel().tolist()})
        print(f'{category}: {len(rows)} sources prepared', flush=True)
    for split, (images, labels) in buckets.items():
        np.savez_compressed(data / f'{split}.npz', x=np.asarray(images, dtype=np.float32)[:, None], y=np.asarray(labels, dtype=np.int64))
    (data / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    fixture_path = ROOT.parent / 'web/tests/fixtures.json'
    fixture_path.parent.mkdir(parents=True, exist_ok=True)
    fixture_path.write_text(json.dumps(fixtures))
    print('Prepared splits and browser preprocessing fixtures.', flush=True)

if __name__ == '__main__':
    main()
