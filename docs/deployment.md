# Optional static deployment

1. In `web`, run `npm.cmd ci`, `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run test:browser`.
2. Preview with `npm.cmd run preview -- --host 127.0.0.1 --port 4173` and test camera behavior on the target browser.
3. Deploy the **contents of web/dist** to any static HTTPS host. Do not deploy the Python environment or dataset. No backend or secrets are needed.

For GitHub Pages, publish the build directory as the Pages artifact (optionally through a manually triggered GitHub Actions workflow). Vite uses `base: './'`, so `/air-draw/` works without editing hard-coded root paths. The host must serve actual `.wasm`, `.mjs`, `.onnx`, and `.task` assets rather than rewriting missing files to index.html. WASM should use `application/wasm`; JS/MJS should use a JavaScript MIME type. This app has no client-side routes requiring an SPA fallback.

Confirm these relative paths in the deployed directory:

- `models/air-draw.onnx`, `models/metadata.json`
- `models/hand_landmarker.task`
- `mediapipe/` (copied WASM loader and binaries)
- `ort/ort-wasm-simd-threaded.mjs` and `.wasm`
- `tracker.js` and Vite's hashed `assets/` directory

Serve index.html, tracker.js, and model/runtime paths with revalidation or a short cache lifetime so a model/runtime update cannot combine old JS with new WASM. Hashed assets can use immutable caching. Keep the whole build from one dependency lockfile together.

HTTPS is required for camera permissions outside localhost. No COOP/COEP headers are required with one ONNX WASM thread. A restrictive Content Security Policy needs same-origin scripts, workers and connections plus WebAssembly compilation allowance; test the host policy with both workers before publication.

All assets are served by the static host, including on the first visit. The app does not contact third-party CDNs at runtime. First-visit payload is dominated by tracker and WASM binaries, not the small drawing classifier. Standard browser caching helps later visits, but offline reload is not guaranteed.

Publication and GitHub pushes require the repository owner's approval. No auto-publish workflow is installed.
