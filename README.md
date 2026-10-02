# air draw

Draw with a mouse, touch, or your index finger on camera. A ten-category neural network guesses your drawing locally in the browser. Choose a 30-second round or untimed practice. No backend, account, API key, or deployment is needed.

## requirements

- Node.js 24 with npm, available from [nodejs.org](https://nodejs.org/).
- A desktop browser. Automated checks use Chromium; other browsers and real camera hardware need manual testing.
- A webcam only for air drawing. Mouse/touch drawing needs no camera.
- Internet for the initial dependency/browser downloads. The trained drawing model and hand model are included. **Python and datasets are not needed to play.**

## download and run

Clone the repository, or download and extract its ZIP from GitHub. Open a terminal in the resulting `air-draw` folder. Git users can run:

```text
git clone https://github.com/nenurd44/air-draw.git
cd air-draw
```

### windows / powershell

```powershell
node --version
npm.cmd --version
cd web
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
```

### macos / linux

```sh
node --version
npm --version
cd web
npm ci
npm run dev -- --host 127.0.0.1
```

Open **http://127.0.0.1:5173** (or the address printed by Vite if that port is busy). **Keep the terminal running while using the app.** Stop it with `Ctrl+C`.

Next time, open a terminal in `web` and run the same dev command. You only need `npm ci` again after dependencies change. Windows uses `npm.cmd` to avoid PowerShell's `npm.ps1` execution-policy restriction; do not change the system execution policy.

If using the portable Node already present on the original development machine, run this from the repository root before the commands above:

```powershell
$env:Path = "$PWD\.tools\node-v24.21.0-win-x64;$env:Path"
```

That `.tools` directory is ignored by Git; new users should install Node normally. Windows is the tested setup. The equivalent macOS/Linux commands are provided but were not exercised on those operating systems.

## how to use it

1. Press **start drawing**. The board opens with a word and a 30-second timer. **just practice** opens an untimed board instead.
2. Drag on the board with a mouse or finger. For air drawing, press **enable camera**, allow access, and show one hand. Move your index fingertip; pinch thumb and index together to draw, then separate them to lift the pen.
3. Watch the predictions. A correct top guess with a score of at least 65% must persist for 800 ms across fresh observations to win. The classifier never receives the requested word.
4. **undo** removes the last stroke; **clear** erases the board. The result and **next round** appear above the canvas. **back to start** resets the round and stops the camera.

Camera controls are beside the board on desktop and above it in a compact sticky panel on small screens. Instructions are beside the board on desktop and below the predictions on mobile. The preview and cursor movement are mirrored.

The model knows only **circle, triangle, star, house, tree, fish, bicycle, umbrella, cup, and airplane**. Other drawings can still receive confident scores; these scores are not calibrated certainty. Simple outlines work best.

## if something does not work

| Problem | What to do |
|---|---|
| The page will not open | Start the server again and keep its terminal open. Use the exact URL printed there. A localhost link stops working when its server stops. |
| `node` or `npm.cmd` is not recognized | Install Node 24 and reopen the terminal, or use the portable PATH command on the original machine. |
| PowerShell says script execution is disabled | Use `npm.cmd` and `npx.cmd`, rather than `npm` and `npx`. |
| A port is already in use | Stop the older server with `Ctrl+C`, or pass another port, for example `--port 5174`. |
| Camera access fails | Use localhost, allow camera permission in the browser, and close other apps using it. Mouse drawing still works. No audio permission is needed. |
| No hand is found | Improve lighting and keep the entire hand visible. Separate your fingers before moving to start another stroke. |
| Recognition is unavailable | Run `npm.cmd ci` in `web`, restart the dev server, and reload. Keep `web/public/models` intact. Practice drawing remains available. |
| Opening `index.html` directly fails | Use the local server; do not open the HTML file using a `file://` URL. |
| A build mentions `Cannot find native binding` and `Application Control policy has blocked this file` | Windows has blocked the installed build-tool binary. Check with the machine administrator or verify on an unrestricted machine. Reinstalling alone may not resolve that policy block. |

## checks and local production preview

From `web`, with Node on PATH:

```powershell
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:browser
```

Use `npm` / `npx` instead on macOS/Linux. Core and browser tests require no dataset or Python. Browser tests start and stop their own server on port 4173; stop any existing preview on that port first. They use a synthetic camera feed and controlled landmarks alongside real model inference. They do not prove physical-hand tracking quality on your webcam.

To try the built app locally after the tests:

```powershell
npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open **http://127.0.0.1:4173** and keep that terminal running. This is a local preview, not a deployment. Build output is in `web/dist`. The build copies local runtime assets from dependencies; rebuilding is required after source changes when using preview. The development server updates automatically.

## optional model training

Only needed to reproduce or change the classifier. Python 3.13 and CPU PyTorch were used. From the repository root on Windows:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install --timeout 120 -r ml/requirements.txt
.venv\Scripts\python.exe ml/download.py --per-category 2000
.venv\Scripts\python.exe ml/prepare.py --per-category 2000 --seed 42
.venv\Scripts\python.exe ml/train.py --epochs 10 --seed 42 --threads 2
.venv\Scripts\python.exe ml/verify.py
npm.cmd --prefix web run test:parity
```

Preparation generates the ignored `web/tests/fixtures.json` used only by `test:parity`, which compares Python/TypeScript rasterization within 1e-6. On macOS/Linux the virtual-environment interpreter is `.venv/bin/python`.

The baseline uses 2,000 recognized unique drawings per category, split 80/10/10 before partial-drawing augmentation. This is a bounded convenience sample, not a random sample of the complete dataset. Only training gains extra 45-95% prefix examples. Validation selects the epoch; held-out full and 65%-prefix drawings are evaluated separately. Test accuracy is **96.00% full / 89.95% partial**; live air-drawing accuracy has not been measured.

See [evaluation](docs/evaluation.md), [metrics](docs/metrics.json), and [design notes](docs/design.md) for details. Source data, prepared splits, local training weights, environments and dependencies are excluded from Git.

## project layout

| Location | Purpose |
|---|---|
| `web/src` | UI, drawing logic, camera tracking and recognition workers |
| `web/public/models` | Included classifier, metadata and hand model |
| `web/tests` | Core, browser, and optional training-parity tests |
| `ml` | Download, preprocessing, training and verification scripts |
| `docs` | Design, evaluation and screenshots |
| [CHECKPOINTS.md](CHECKPOINTS.md) | Progress, verified checks and remaining tasks |

## privacy and attribution

After dependencies and local assets are prepared, the app serves inference and tracking assets locally. It makes no CDN or inference-service requests while playing. Camera frames and drawings are not uploaded. This is not an installable offline app: the local server must remain available.

Inspired by Google's Quick, Draw!, with no affiliation. Drawing data comes from [Google Quick, Draw! contributors](https://github.com/googlecreativelab/quickdraw-dataset) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Sampling, preprocessing and training produce the included derived classifier. Retain the dataset/model attribution and [third-party notices](THIRD_PARTY.md). Generated dataset fixtures remain local and are not included in Git. MediaPipe and ONNX Runtime have their own licenses, noted in that file.

Deployment is intentionally outside this project's completion requirements.

## verification status and remaining work

The current Windows workspace passes the production build, 17 Chromium browser tests, four core tests and the optional training-parity check. An isolated copy with no dependencies or dataset initially present passed `npm ci` and the four core tests; its build was blocked twice by Windows Application Control loading Rolldown's native binary. Full fresh-install verification is therefore still pending on an unrestricted machine. The existing workspace build is unaffected.

To finish: verify this README from a fresh checkout on the intended machine, and manually check webcam permission, pinch drawing, pen-up movement, recognition and camera shutdown. Broader browser/OS coverage is optional unless you intend to support those platforms. No additional features or deployment are required. See [CHECKPOINTS.md](CHECKPOINTS.md) for the latest process state and resume instructions.
