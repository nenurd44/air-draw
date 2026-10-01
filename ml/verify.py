"""Verify prepared splits and exported baseline without retraining or selection."""
import hashlib
import json
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch

from common import CATEGORIES
from train import SmallCNN

ROOT = Path(__file__).resolve().parent


def main():
    manifest = json.loads((ROOT / 'data/manifest.json').read_text())
    ids = [set(manifest['splits'][s]) for s in ('train', 'val', 'test')]
    assert all(len(ids[i]) == len(manifest['splits'][s])
               for i, s in enumerate(('train', 'val', 'test')))
    assert not (ids[0] & ids[1] or ids[0] & ids[2] or ids[1] & ids[2])
    for category in CATEGORIES:
        source = ROOT / f'data/{category}.ndjson'
        assert hashlib.sha256(source.read_bytes()).hexdigest() == manifest['sha256'][category]
    for split in ('train', 'val', 'test', 'test_partial'):
        with np.load(ROOT / f'data/{split}.npz') as data:
            x, y = data['x'], data['y']
            source_split = 'test' if split == 'test_partial' else split
            count = len(manifest['splits'][source_split]) * (2 if split == 'train' else 1)
            assert x.shape == (count, 1, 32, 32) and y.shape == (count,)
            assert x.dtype == np.float32 and y.dtype == np.int64
            assert np.isfinite(x).all() and x.min() >= 0 and x.max() <= 1
            assert np.all(np.bincount(y, minlength=10) == count // 10)
            print(f'{split}: {count} finite, balanced examples')

    public = ROOT.parent / 'web/public/models'
    model_path = public / 'air-draw.onnx'
    metrics = json.loads((ROOT.parent / 'docs/metrics.json').read_text())
    metadata = json.loads((public / 'metadata.json').read_text())
    digest = hashlib.sha256(model_path.read_bytes()).hexdigest()
    assert digest == metrics['model_sha256'] == metadata['sha256']
    assert metrics['categories'] == metadata['categories'] == CATEGORIES
    onnx.checker.check_model(str(model_path))
    torch.set_num_threads(2)
    model = SmallCNN()
    model.load_state_dict(torch.load(ROOT / 'runs/baseline.pt', weights_only=True))
    model.eval()
    session = ort.InferenceSession(str(model_path), providers=['CPUExecutionProvider'])
    # Exercise one held-out example per class, beyond the exporter's single sample.
    data = np.load(ROOT / 'data/test.npz')
    max_error = 0.0
    for label in range(10):
        sample = data['x'][np.flatnonzero(data['y'] == label)[0]][None]
        with torch.no_grad():
            expected = model(torch.from_numpy(sample)).numpy()
        actual = session.run(None, {'image': sample})[0]
        assert actual.shape == (1, 10) and np.isfinite(actual).all()
        max_error = max(max_error, float(np.max(np.abs(actual - expected))))
    assert max_error < 1e-4, max_error
    confusion = np.asarray(metrics['confusion_matrix_rows_true_columns_predicted'])
    assert confusion.shape == (10, 10) and confusion.sum() == len(data['y'])
    assert np.isclose(np.trace(confusion) / confusion.sum(), metrics['test_accuracy'])
    assert metrics['validation_accuracy'] == max(e['val_accuracy'] for e in metrics['history'])
    print(f'Splits disjoint; hashes and metrics valid; ONNX max error: {max_error:.8g}')


if __name__ == '__main__':
    main()
