# Checkpoint 4 baseline evaluation

The existing pipeline was completed on 2026-10-01 using Python 3.13, CPU
PyTorch 2.14.1, seed 42, two training threads and ten epochs. Resolved Python
dependencies are pinned in `ml/requirements.txt`. Machine-readable results,
training history, source hashes and the full confusion matrix are in
[`metrics.json`](metrics.json).

## Data and selection

The cache contains 2,000 recognized, unique drawings per category: 20,000 total.
This is a bounded prefix convenience sample, not a random sample of the full
Quick, Draw! corpus. Source IDs are split before augmentation, with no overlap:

| Split | Source drawings | Raster examples |
|---|---:|---:|
| Training | 16,000 | 32,000 (full plus one 45–95% prefix) |
| Validation | 2,000 | 2,000 full |
| Test | 2,000 | 2,000 full plus 2,000 paired 65% prefixes |

Every split is balanced across ten categories. Partial and full test examples
share source drawings intentionally and are not independent test sets. The best
validation epoch was epoch 10, at 95.70%; test data were not used for selection.

## Results

| Measure | Result |
|---|---:|
| Full-drawing test accuracy | 96.00% (1,920 / 2,000) |
| 65%-prefix test accuracy | 89.95% (1,799 / 2,000) |
| Model parameters | 43,162 |
| Training/evaluation/export time reported by pipeline | 410.8 seconds |
| Exported ONNX size | 174,847 bytes |
| Exporter's PyTorch/ONNX maximum absolute logit error | 0.0000038147 |

| Category | Correct / 200 | Recall |
|---|---:|---:|
| circle | 193 | 96.5% |
| triangle | 193 | 96.5% |
| star | 193 | 96.5% |
| house | 196 | 98.0% |
| tree | 194 | 97.0% |
| fish | 188 | 94.0% |
| bicycle | 194 | 97.0% |
| umbrella | 188 | 94.0% |
| cup | 189 | 94.5% |
| airplane | 192 | 96.0% |

The largest directed confusions were fish → airplane (8), umbrella → tree (7),
and airplane → star (6).

Export: `web/public/models/air-draw.onnx`, opset 17, input float32
`[1,1,32,32]`, output ten logits in metadata category order. SHA256:
`8bbc9784d8671a3fe914d0a17edfef0ca849897d657eb957afd316e0887aaa60`.

## Verification and limits

`ml/verify.py` checks source hashes, split separation, counts, balance, shapes,
finite normalized pixels, model/metadata hashes, ONNX validity, metric consistency,
and PyTorch/ONNX output agreement on one held-out sample per category. Existing
Node tests check Python/TypeScript rasterization agreement within 1e-6 on ten
held-out drawings. Reproduction commands are in [CHECKPOINTS.md](../CHECKPOINTS.md).

The exporter emitted a deprecation warning for the explicitly selected legacy
TorchScript exporter (`dynamo=False`); export succeeded. This can be revisited
when upgrading training tooling, without changing this completed baseline.

These scores do not establish browser or live-air accuracy. Recognized-only
sampling, a small source subset, hand-tracking noise, incomplete drawings and
domain differences limit generalization. Scores are not calibrated confidence;
the model has no unknown-class detector. No hyperparameter search or repeated
seed study was performed. Browser recognition and the complete game loop remain
separate, deferred checkpoints.
