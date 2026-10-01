"""Shared category order and deterministic vector rasterization (mirrored in web)."""
import numpy as np

CATEGORIES = ['circle', 'triangle', 'star', 'house', 'tree', 'fish', 'bicycle', 'umbrella', 'cup', 'airplane']
SIZE = 32

def rasterize(strokes):
    strokes = [np.asarray(s, dtype=np.float64) for s in strokes if len(s)]
    out = np.zeros((SIZE, SIZE), dtype=np.float64)
    if not strokes:
        return out.astype(np.float32)
    points = np.concatenate(strokes)
    lo, hi = points.min(0), points.max(0)
    scale = 24.0 / max(float((hi - lo).max()), 1.0)
    offset = (32 - (hi - lo) * scale) / 2
    yy, xx = np.mgrid[:SIZE, :SIZE] + 0.5
    for stroke in strokes:
        s = (stroke - lo) * scale + offset
        for i in range(max(1, len(s) - 1)):
            a, b = s[i], s[min(i + 1, len(s) - 1)]
            dx, dy = b - a
            denom = dx * dx + dy * dy
            t = np.clip(((xx - a[0]) * dx + (yy - a[1]) * dy) / max(denom, 1e-12), 0, 1)
            distance = np.sqrt((xx - a[0] - t * dx)**2 + (yy - a[1] - t * dy)**2)
            np.maximum(out, np.clip(1.35 - distance, 0, 1), out=out)
    return out.astype(np.float32)

def prefix(strokes, fraction):
    remaining = max(2, int(sum(len(s) for s in strokes) * fraction))
    result = []
    for s in strokes:
        if remaining <= 0:
            break
        result.append(s[:remaining])
        remaining -= len(s)
    return result
