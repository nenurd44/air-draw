/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm'
import { rasterize, type Stroke } from './drawing'
let session: ort.InferenceSession | undefined
self.onmessage = async (event: MessageEvent) => {
  try {
    const msg = event.data
    if (msg.type === 'init') {
      ort.env.wasm.numThreads = 1
      ort.env.wasm.wasmPaths = `${msg.base}ort/`
      session = await ort.InferenceSession.create(`${msg.base}models/air-draw.onnx`, { executionProviders: ['wasm'] })
      self.postMessage({ type: 'ready' })
    } else if (msg.type === 'predict' && session) {
      const start = performance.now()
      const pixels = rasterize(msg.strokes as Stroke[])
      const results = await session.run({ image: new ort.Tensor('float32', pixels, [1, 1, 32, 32]) })
      const logits = Array.from(results.logits.data as Float32Array)
      const max = Math.max(...logits), exps = logits.map(x => Math.exp(x - max)), sum = exps.reduce((a,b) => a+b, 0)
      self.postMessage({ type: 'prediction', revision: msg.revision, round: msg.round, probabilities: exps.map(x => x / sum), ms: performance.now() - start })
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error) }) }
}
