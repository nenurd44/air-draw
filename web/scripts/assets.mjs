import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { build } from 'esbuild'
import { createHash } from 'node:crypto'

await mkdir('public/models', { recursive: true })
await mkdir('public/ort', { recursive: true })
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe', { recursive: true })
// Single-threaded SIMD runtime. JS and WASM must come from the SAME package.
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await cp(`node_modules/onnxruntime-web/dist/${name}`, `public/ort/${name}`)
}
await build({ entryPoints: ['src/tracker.worker.ts'], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: 'public/tracker.js' })
const path = 'public/models/hand_landmarker.task'
try { await access(path) } catch {
  console.log('Downloading official MediaPipe hand model (about 8 MB)…')
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task')
  if (!response.ok) throw new Error(`Tracker download failed: ${response.status}`)
  await writeFile(path, Buffer.from(await response.arrayBuffer()))
}
const bytes = await readFile(path)
console.log(`Hand tracker SHA256: ${createHash('sha256').update(bytes).digest('hex')}`)
console.log('Local runtime assets ready.')
