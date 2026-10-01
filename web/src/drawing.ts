export type Point = { x: number; y: number }
export type Stroke = Point[]
export const CATEGORIES = ['circle', 'triangle', 'star', 'house', 'tree', 'fish', 'bicycle', 'umbrella', 'cup', 'airplane'] as const

// Same distance-field rasterizer as ml/common.py: point bounds, aspect-preserving
// 24px content box, centered 32px image, white ink on black, [0,1] float32.
export function rasterize(strokes: Stroke[]): Float32Array {
  const out = new Float32Array(1024)
  const points = strokes.flat()
  if (!points.length) return out
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  const scale = 24 / Math.max(maxX - minX, maxY - minY, 1)
  const ox = (32 - (maxX - minX) * scale) / 2
  const oy = (32 - (maxY - minY) * scale) / 2
  for (const stroke of strokes) {
    const s = stroke.map(p => ({ x: (p.x - minX) * scale + ox, y: (p.y - minY) * scale + oy }))
    for (let i = 0; i < Math.max(1, s.length - 1) && s.length; i++) {
      const a = s[i], b = s[Math.min(i + 1, s.length - 1)]
      const dx = b.x - a.x, dy = b.y - a.y, denom = Math.max(dx * dx + dy * dy, 1e-12)
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const t = Math.max(0, Math.min(1, ((x + .5 - a.x) * dx + (y + .5 - a.y) * dy) / denom))
        const value = Math.max(0, Math.min(1, 1.35 - Math.hypot(x + .5 - a.x - t * dx, y + .5 - a.y - t * dy)))
        out[y * 32 + x] = Math.max(out[y * 32 + x], value)
      }
    }
  }
  return out
}

export class Drawing {
  strokes: Stroke[] = []
  revision = 0
  private active: Stroke | null = null
  begin(p: Point) { this.end(); this.active = [p]; this.strokes.push(this.active); this.revision++ }
  move(p: Point) {
    if (!this.active) return
    const last = this.active[this.active.length - 1]
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return
    // Bound work for long held pinches without joining separate strokes.
    if (this.active.length >= 2000) return
    this.active.push(p); this.revision++
  }
  end() { this.active = null }
  clear() { this.end(); this.strokes = []; this.revision++ }
  undo() { this.end(); this.strokes.pop(); this.revision++ }
  get hasInk() { return this.strokes.some(s => s.length >= 2) }
}

export class Pinch {
  down = false
  update(ratio: number) {
    this.down = Number.isFinite(ratio) && ratio < (this.down ? .48 : .30)
    return this.down
  }
  reset() { this.down = false }
}

export class StableGuess {
  private since = 0
  private previous = 0
  reset() { this.since = 0; this.previous = 0 }
  update(correct: boolean, now: number) {
    if (!correct) { this.reset(); return false }
    if (!this.since || now - this.previous > 1200) this.since = now
    this.previous = now
    return now - this.since >= 800
  }
}
