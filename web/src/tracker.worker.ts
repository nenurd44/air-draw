/// <reference lib="webworker" />
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
let tracker: HandLandmarker | undefined
self.onmessage = async (event: MessageEvent) => {
  const msg = event.data
  try {
    if (msg.type === 'init') {
      const vision = await FilesetResolver.forVisionTasks(`${msg.base}mediapipe/`)
      tracker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${msg.base}models/hand_landmarker.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: .55, minHandPresenceConfidence: .55, minTrackingConfidence: .55,
      })
      self.postMessage({ type: 'ready' })
    } else if (msg.type === 'frame' && tracker) {
      const start = performance.now()
      const result = tracker.detectForVideo(msg.bitmap, msg.time)
      self.postMessage({ type: 'landmarks', points: result.landmarks[0] ?? null, ms: performance.now() - start })
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error) }) }
  finally { if (msg.bitmap) msg.bitmap.close() }
}
