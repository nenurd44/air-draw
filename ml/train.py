"""CPU baseline, validation checkpoint selection, held-out evaluation, ONNX export."""
import argparse
import copy
import hashlib
import json
import random
import time
from pathlib import Path
import numpy as np
import torch
from torch import nn
from common import CATEGORIES

ROOT = Path(__file__).resolve().parent

class SmallCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(nn.Conv2d(1, 12, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(12, 24, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(24, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Flatten(), nn.Linear(32*4*4, 64), nn.ReLU(), nn.Dropout(.15), nn.Linear(64, 10))
    def forward(self, x):
        return self.net(x)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, default=10)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--threads', type=int, default=2)
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    random.seed(args.seed)
    torch.use_deterministic_algorithms(True)
    datasets = {}
    for split in ['train', 'val', 'test', 'test_partial']:
        f = np.load(ROOT / f'data/{split}.npz')
        datasets[split] = torch.utils.data.TensorDataset(torch.from_numpy(f['x']), torch.from_numpy(f['y']))
    loaders = {s: torch.utils.data.DataLoader(d, batch_size=64, shuffle=s=='train', num_workers=0) for s,d in datasets.items()}
    model = SmallCNN()
    opt = torch.optim.Adam(model.parameters(), lr=.001)
    loss_fn = nn.CrossEntropyLoss()
    def evaluate(split):
        model.eval()
        confusion = np.zeros((10,10), dtype=int)
        with torch.no_grad():
            for x,y in loaders[split]:
                pred = model(x).argmax(1).numpy()
                np.add.at(confusion, (y.numpy(),pred), 1)
        return float(np.trace(confusion)/confusion.sum()), confusion
    best, history, start = -1, [], time.time()
    for epoch in range(args.epochs):
        model.train()
        total = 0
        for x,y in loaders['train']:
            opt.zero_grad(set_to_none=True)
            loss = loss_fn(model(x), y)
            loss.backward()
            opt.step()
            total += loss.item()*len(y)
        accuracy,_ = evaluate('val')
        history.append({'epoch': epoch+1, 'loss': total/len(datasets['train']), 'val_accuracy': accuracy})
        if accuracy > best:
            best, weights = accuracy, copy.deepcopy(model.state_dict())
        print(json.dumps(history[-1]), flush=True)
    model.load_state_dict(weights)
    accuracy, confusion = evaluate('test')
    partial, _ = evaluate('test_partial')
    public = ROOT.parent / 'web/public/models'
    public.mkdir(parents=True, exist_ok=True)
    model.eval()
    model_path = public / 'air-draw.onnx'
    torch.onnx.export(model, torch.zeros(1,1,32,32), str(model_path), input_names=['image'], output_names=['logits'], opset_version=17, dynamo=False)
    import onnxruntime as ort
    session = ort.InferenceSession(str(model_path), providers=['CPUExecutionProvider'])
    example = datasets['test'][0][0][None]
    with torch.no_grad():
        expected = model(example).numpy()
    error = float(np.max(np.abs(expected-session.run(None, {'image':example.numpy()})[0])))
    assert error < 1e-4, error
    manifest = json.loads((ROOT/'data/manifest.json').read_text())
    split_ids = [set(manifest['splits'][s]) for s in ['train','val','test']]
    assert not (split_ids[0]&split_ids[1] or split_ids[0]&split_ids[2] or split_ids[1]&split_ids[2])
    metrics = {'categories':CATEGORIES, 'seed':args.seed, 'epochs':args.epochs, 'parameters':sum(p.numel() for p in model.parameters()), 'seconds':round(time.time()-start,1), 'source_drawings_per_category':manifest['per_category'], 'source_split_counts':{s:len(v) for s,v in manifest['splits'].items()}, 'train_examples_including_partials':len(datasets['train']), 'validation_accuracy':best, 'test_accuracy':accuracy, 'test_partial_65pct_accuracy':partial, 'confusion_matrix_rows_true_columns_predicted':confusion.tolist(), 'history':history, 'onnx_max_absolute_error':error, 'model_bytes':model_path.stat().st_size, 'model_sha256':hashlib.sha256(model_path.read_bytes()).hexdigest(), 'source_sha256':manifest['sha256'], 'sampling':manifest['sampling']}
    docs = ROOT.parent/'docs'
    docs.mkdir(exist_ok=True)
    (docs/'metrics.json').write_text(json.dumps(metrics, indent=2))
    (public/'metadata.json').write_text(json.dumps({'categories':CATEGORIES, 'input':[1,1,32,32], 'preprocessing':'vector-distance-v1', 'test_accuracy':accuracy, 'license':'CC BY 4.0 (Quick, Draw! derived model)', 'sha256':metrics['model_sha256']}, indent=2))
    (ROOT/'runs').mkdir(exist_ok=True)
    torch.save(weights, ROOT/'runs/baseline.pt')
    print(f'Test accuracy: {accuracy:.2%}; partial: {partial:.2%}; ONNX error: {error:.2g}', flush=True)

if __name__ == '__main__':
    main()
