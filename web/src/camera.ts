import { Pinch, type Point } from './drawing'
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
export class Camera {
  ready = false
  ms = 0
  private video = $<HTMLVideoElement>('video')
  private worker: Worker | null = null
  private stream: MediaStream | null = null
  private generation = 0
  private starting = false
  private busy = false
  private sent = 0
  private lastTime = -1
  private lastFrame = 0
  private lastHand = 0
  private smoothed: Point | null = null
  private pinch = new Pinch()
  private base: string
  private onPoint: (point: Point | null, down: boolean) => void
  constructor(base: string, onPoint: (point: Point | null, down: boolean) => void) {
    this.base = base; this.onPoint = onPoint
    $('camera').onclick = () => { if (this.stream || this.starting) this.stop(); else void this.start() }
  }
  reset() { this.pinch.reset(); this.smoothed = null; $('cursor').hidden = true; this.onPoint(null, false) }
  stop(message = 'Camera is off. Mouse drawing is ready.') {
    this.generation++; this.starting = false; this.ready = false; this.busy = false; this.lastTime = -1
    this.worker?.terminate(); this.worker = null
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null; this.video.srcObject = null
    this.reset(); $('camera-placeholder').hidden = false; $('camera').textContent = 'Enable camera'
    $('camera-status').textContent = message; $('pen-status').textContent = 'MOUSE / TOUCH'
  }
  private async start() {
    if (!navigator.mediaDevices?.getUserMedia) { this.stop('Camera needs HTTPS or localhost and a supported browser. Mouse drawing still works.'); return }
    const generation = ++this.generation
    this.starting = true; $('camera').textContent = 'Cancel camera'; $('camera-status').textContent = 'Waiting for camera permission…'
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 24, max: 30 } }, audio: false })
      if (generation !== this.generation) { media.getTracks().forEach(t => t.stop()); return }
      this.stream = media; this.video.srcObject = media; await this.video.play()
      if (generation !== this.generation) return
      for (const track of media.getTracks()) track.onended = () => this.stop('Camera disconnected. Reconnect it and enable the camera again.')
      $('camera-placeholder').hidden = true; $('camera-status').textContent = 'Loading hand tracking on your device…'
      this.worker = new Worker(`${this.base}tracker.js`)
      this.worker.onerror = e => this.stop(`Hand tracking could not start: ${e.message}. Mouse drawing still works.`)
      this.worker.onmessage = event => {
        if (generation !== this.generation) return
        const msg = event.data
        if (msg.type === 'ready') { this.ready = true; this.starting = false; $('camera').textContent = 'Disable camera'; $('camera-status').textContent = 'Show one hand. Pinch thumb and index to draw.' }
        if (msg.type === 'error') this.stop(`Tracking error: ${msg.message}. Mouse drawing still works.`)
        if (msg.type === 'landmarks') {
          this.busy = false; this.ms = msg.ms; this.lastHand = performance.now()
          if (!msg.points || document.hidden) { this.reset(); $('camera-status').textContent = 'No hand in view. Hold one hand inside the frame.'; $('pen-status').textContent = 'LOOKING FOR A HAND'; return }
          const points = msg.points as Point[], tip = points[8]
          const distance = (a: Point, b: Point) => Math.hypot((a.x-b.x)*this.video.videoWidth, (a.y-b.y)*this.video.videoHeight)
          const ratio = distance(points[4], tip) / Math.max(distance(points[0], points[9]), 1)
          const next = { x: Math.max(0, Math.min(800, (1-tip.x)*800)), y: Math.max(0, Math.min(600, tip.y*600)) }
          this.smoothed = this.smoothed ? { x: this.smoothed.x + .55*(next.x-this.smoothed.x), y: this.smoothed.y + .55*(next.y-this.smoothed.y) } : next
          const down = this.pinch.update(ratio)
          $('cursor').hidden = false; $('cursor').style.left = `${this.smoothed.x/8}%`; $('cursor').style.top = `${this.smoothed.y/6}%`; $('cursor').classList.toggle('drawing', down)
          $('pen-status').textContent = down ? '● PEN DOWN' : '○ PEN UP'
          $('camera-status').textContent = down ? 'Drawing! Separate your fingers to lift the pen.' : 'Hand found. Pinch thumb and index to draw.'
          this.onPoint(this.smoothed, down)
        }
      }
      this.worker.postMessage({ type: 'init', base: this.base })
      setTimeout(() => { if (generation === this.generation && !this.ready) this.stop('Hand tracking timed out. Disable other camera apps and try again.') }, 45000)
    } catch (error) {
      if (generation !== this.generation) return
      const name = error instanceof DOMException ? error.name : ''
      const messages: Record<string,string> = { NotAllowedError: 'Camera permission was denied. Allow it in your browser and try again.', NotFoundError: 'No camera was found. Connect one and try again.', NotReadableError: 'Camera is busy or unavailable. Close other camera apps and try again.' }
      this.stop(`${messages[name] ?? `Could not start camera: ${String(error)}`} Mouse drawing still works.`)
    }
  }
  frame(now: number) {
    if (now - this.lastHand > 450 && this.smoothed) this.reset()
    if (this.busy && now-this.sent > 10000) { this.stop('Hand tracking stopped responding. Enable the camera to retry.'); return }
    if (!this.ready || !this.worker || this.busy || document.hidden || this.video.readyState < 2 || now-this.lastFrame < 66 || this.video.currentTime === this.lastTime) return
    this.lastFrame = now; this.lastTime = this.video.currentTime; this.busy = true; this.sent = now
    const worker = this.worker
    void createImageBitmap(this.video).then(bitmap => {
      if (worker !== this.worker) { bitmap.close(); return }
      worker.postMessage({ type: 'frame', bitmap, time: now }, [bitmap])
    }).catch(error => this.stop(`Camera frame unavailable: ${String(error)}. Mouse drawing still works.`))
  }
}
