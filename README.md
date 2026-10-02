# Air Draw

Checkpoint status and exact continuation commands are in [CHECKPOINTS.md](CHECKPOINTS.md).
Checkpoint 5 browser recognition checks pass in Chromium: real mouse predictions,
controlled air landmark input through the real classifier, camera worker startup
and cleanup, and stale-result rejection. Physical-hand accuracy remains a manual
check. The complete game loop is preserved for checkpoint 6 verification.

A browser drawing game with mouse/touch input, webcam fingertip drawing, and a real ten-class CNN running locally. No backend, API key, or cloud inference. Inspired by Google's Quick, Draw!, not affiliated with Google.

## Start locally (Windows / PowerShell)

Requires Node.js LTS (24 recommended). Python is only needed to retrain; the exported browser model is included.

```powershell
cd C:\Users\b41st\Desktop\vscode\air-draw
# This machine has a verified portable Node installation in .tools.
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
node --version
npm.cmd --version
cd web
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
```

Open **http://127.0.0.1:5173**. On another machine, install [Node.js LTS](https://nodejs.org/en/download) and omit the portable PATH line. `npm.cmd` avoids PowerShell's `npm.ps1` execution-policy restriction; changing the system execution policy is unnecessary.

1. Click **Start drawing** on the welcome screen. The board opens with a random drawing prompt and a 30-second timer. Choose **Just practice** for untimed sketching instead.
2. Optionally click **Enable camera**, allow access, and hold one hand inside the preview. The preview and drawing movement are mirrored.
3. Your index fingertip is the cursor. Bring thumb and index together to draw; separate them to lift the pen. Move to a new position with the pen up.
4. Use **Undo** for the last stroke, **Clear** for a fresh canvas, and **Restart round** for a new prompt.
   **Back to start** returns to the welcome screen, clears the round, and turns off the camera.
5. A top prediction above 65% must remain correct for at least 800 ms across fresh observations to win. The model never receives the requested category.

Categories: circle, triangle, star, house, tree, fish, bicycle, umbrella, cup, airplane. The model only knows these categories; percentages are relative model scores, not calibrated certainty.

Use current desktop Chrome or Edge for the verified WebAssembly/worker camera path. Webcam access requires localhost or HTTPS. Good light, a clear background, and a fully visible hand help. Camera denial, missing/busy cameras, and tracking loss have mouse fallbacks. Disabling the camera stops all video tracks. No audio is requested.

## Verify and build

From `web`:

```powershell
npm.cmd test
npm.cmd run build
# One-time browser test setup:
npx.cmd playwright install chromium
npm.cmd run test:browser
# Checkpoint 5 only (excludes the game-loop test):
npm.cmd run test:recognition
npm.cmd run preview -- --host 127.0.0.1 --port 4173
```

The production directory is `web/dist`. The build regenerates local runtime assets from installed packages and bundles the classic MediaPipe worker. The ONNX model and hand tracker model remain in `web/public/models` so a deployment does not require training. Dependencies and copied WASM files are excluded from Git and reproduced by `npm ci` and the asset script.

Initial dependency installation and the first tracker-model download require internet. Once prepared, development/build and local play use files served by this project. The running game makes no CDN or inference-service requests. On a hosted site the first visit downloads assets from that host; this is not a service-worker offline-installable app. Camera frames and drawings are never uploaded.

## Train the baseline

Python 3.13 was used. Commands from the repository root:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install --timeout 120 -r ml/requirements.txt
.venv\Scripts\python.exe ml/download.py --per-category 2000
.venv\Scripts\python.exe ml/prepare.py --per-category 2000 --seed 42
.venv\Scripts\python.exe ml/train.py --epochs 10 --seed 42 --threads 2
.venv\Scripts\python.exe ml/verify.py
```

Preparation also regenerates `web/tests/fixtures.json` for the rasterizer parity
test. This dataset-derived fixture stays local and is excluded from Git along
with the source datasets and prepared splits. Run preparation before `npm test`
on a fresh checkout.

Downloads are streamed and stop after 2,000 recognized unique source drawings per category. This intentionally small convenience sample is not a random sample of Google's full corpus. Cached samples are kept under ignored `ml/data/`; preparation records their SHA256 hashes. Source drawings are split 80/10/10 before partial examples are made. Only the training set gains a second 45–95% prefix example. Validation/test full drawings and test 65% prefixes stay separate. Training selects the checkpoint by validation accuracy, then evaluates held-out data once and exports ONNX opset 17.

`ml/common.py` and `web/src/drawing.ts` implement the same vector rasterizer: crop to point bounds, preserve aspect ratio in a centered 24px content box, pad to 32×32, render antialiased strokes, and normalize to float32 white ink on black. Fixtures test Python/TypeScript agreement to 1e-6. ONNX export is checked against PyTorch outputs. See [design notes](docs/design.md), [evaluation](docs/evaluation.md), and [machine-readable metrics](docs/metrics.json).

## Optional deployment

See [deployment instructions](docs/deployment.md). Upload only the tested contents of `web/dist` to an HTTPS static host. Relative Vite paths support a repository subdirectory such as `/air-draw/`. No deployment or GitHub push is performed by the build scripts.

## Data and licensing

The [Google Quick, Draw! dataset](https://github.com/googlecreativelab/quickdraw-dataset) is contributed by Quick, Draw! players and released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This project filters, splits, rasterizes, and partially truncates drawings to train a derived classifier. Attribution and source links are included in the app and [THIRD_PARTY.md](THIRD_PARTY.md); retain them in redistribution. The exported classifier and test drawing fixtures are provided under CC BY 4.0. MediaPipe and ONNX Runtime carry their own third-party licenses.
