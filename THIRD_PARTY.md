# Attribution and third-party notices

## Google Quick, Draw!

Drawing data: Google Creative Lab and contributing Quick, Draw! players.
Source: https://github.com/googlecreativelab/quickdraw-dataset
License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/

Modifications: recognized-only bounded sampling, seeded splits, stroke-prefix truncation, custom 32×32 rasterization, and neural network training. The exported `web/public/models/air-draw.onnx` classifier and drawing fixtures in `web/tests/fixtures.json` are distributed under CC BY 4.0 with this attribution. Retain attribution and indicate subsequent changes. No endorsement by Google is implied.

## MediaPipe

Google MediaPipe Tasks Vision and Hand Landmarker model.
Source: https://github.com/google-ai-edge/mediapipe
Documentation and model: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
Code license: Apache License 2.0. Runtime license files come from the installed package; preserve notices when redistributing. The model is downloaded from Google's versioned MediaPipe model bucket (float16/1).

## ONNX Runtime

Microsoft ONNX Runtime: https://github.com/microsoft/onnxruntime
License: MIT. Installed package contains license and third-party notices for its runtime.

## Build / training tooling

Vite (MIT), TypeScript (Apache-2.0), esbuild (MIT), Playwright (Apache-2.0), PyTorch (BSD-style), NumPy (BSD-3-Clause), ONNX (Apache-2.0). Exact resolved dependencies are in `web/package-lock.json` and `ml/requirements.txt`. These tools do not receive camera frames or user drawings.
