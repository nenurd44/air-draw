# Design notes

## Runtime

Vite + TypeScript, with no UI framework. A normalized 800×600 vector drawing plane stays independent of CSS sizing and device pixel ratio. Pointer capture preserves mouse strokes outside the canvas; coordinates are clamped at the boundary. Separate point arrays represent separate strokes. A ResizeObserver redraws all strokes after layout changes. Display stroke width is independent of classifier rasterization.

`inference.worker.ts` owns ONNX WebAssembly inference and rasterization. Requests carry strokes, a drawing revision and round ID, never the requested category. At most one inference is outstanding. Changed drawings are sampled every 350 ms; a pending correct prediction permits confirmation requests on unchanged ink. Stale round/revision responses are discarded. Empty canvases and single taps are skipped. Drawing changes from clear/undo reset success evidence. Results require a top-class probability ≥0.65 for ≥800 ms; gaps over 1.2 seconds reset stability.

`tracker.worker.ts` owns MediaPipe Hand Landmarker. It is bundled to a classic worker because the WASM loader uses importScripts; it is separate from Vite's module inference worker. Frames are transferable ImageBitmaps, closed in a finally block. Tracking is capped near 15 FPS with one pending frame, while rendering and countdown use requestAnimationFrame. Both workers use CPU/WASM to avoid WebGPU requirements and shared GPU contention; ONNX uses one WASM thread, requiring no cross-origin isolation headers.

The index tip (landmark 8) controls the cursor. Pinch uses thumb tip (4) to index tip distance divided by wrist (0) to middle MCP (9) distance in image pixels. A ratio below 0.30 starts drawing; above 0.48 stops it. Exponential smoothing uses alpha 0.55. Missing landmarks, hidden tabs, or a 450 ms tracking gap end strokes. Camera cancellation uses a generation token so late permissions cannot leak a stream. Disable/disconnection/pagehide stops tracks and terminates the tracker worker. There is a watchdog for stalled workers.

The 30-second deadline uses monotonic performance.now(), so a throttled background tab cannot extend the round. Expired rounds are checked before accepting success. Restart clears ink and increments the round ID. Correctness is evaluated outside the classifier.

## Model

Three 3×3 convolution blocks (12, 24, 32 channels), ReLU and 2×2 max pooling, then a 64-unit dense layer, dropout during training and 10 logits. Input is [1,1,32,32]. A stable softmax produces top-three scores in the inference worker. No synthetic fallback predictions exist. Errors leave drawing available and disable timed gameplay.

Data split happens before augmentation. Training includes full drawings and one partial prefix per source. Source IDs are recorded and split intersections asserted empty. Validation chooses the best epoch. Test data are not used for selection. The small recognized-only prefix sample and mouse-to-air domain shift limit the interpretation of accuracy.

## Official references consulted

- [Vite setup and Node requirements](https://vite.dev/guide/)
- [MediaPipe Hand Landmarker Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js): worker recommendation, landmarks, model and VIDEO mode.
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) and [deployment guidance](https://onnxruntime.ai/docs/tutorials/web/deploy.html): WASM execution, same-version local JS/WASM assets.
- [PyTorch local installation](https://pytorch.org/get-started/locally/): Windows CPU installation.
- [Quick, Draw! dataset documentation](https://github.com/googlecreativelab/quickdraw-dataset), [category list](https://raw.githubusercontent.com/googlecreativelab/quickdraw-dataset/master/categories.txt), and [license](https://raw.githubusercontent.com/googlecreativelab/quickdraw-dataset/master/LICENSE).

All ten exact category names were checked, including `cup` (distinct from `coffee cup` and `mug`). Exact JavaScript dependency versions are recorded in package-lock.json; Python versions in ml/requirements.txt.
