import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Drawing, Pinch, StableGuess, rasterize } from '../src/drawing.ts'

test('stroke boundaries, undo, clear, and empty detection', () => {
  const d = new Drawing()
  d.begin({x:0,y:0}); assert.equal(d.hasInk, false)
  d.move({x:20,y:0}); d.end(); d.move({x:90,y:90})
  d.begin({x:50,y:50}); d.move({x:70,y:70}); d.end()
  assert.equal(d.strokes.length, 2); assert.equal(d.strokes[0].length, 2)
  d.undo(); assert.equal(d.strokes.length, 1); assert.equal(d.hasInk, true)
  d.clear(); assert.equal(d.hasInk, false); assert.equal(d.strokes.length, 0)
})
test('pinch hysteresis and loss reset', () => {
  const p = new Pinch()
  assert.equal(p.update(.4), false); assert.equal(p.update(.29), true)
  assert.equal(p.update(.4), true); assert.equal(p.update(.49), false)
  p.update(.1); p.reset(); assert.equal(p.update(.4), false)
  assert.equal(p.update(NaN), false)
})
test('correct guess must persist; wrong or stale observations reset', () => {
  const s = new StableGuess()
  assert.equal(s.update(true, 100), false); assert.equal(s.update(true, 450), false)
  assert.equal(s.update(true, 950), true)
  assert.equal(s.update(false, 1000), false); assert.equal(s.update(true, 1400), false)
  assert.equal(s.update(true, 4000), false)
})
test('Python and browser rasterizers match held-out examples for all 10 classes', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'))
  assert.equal(fixtures.length, 10)
  for (const f of fixtures) {
    const pixels = rasterize(f.strokes.map((s: number[][]) => s.map(([x,y]) => ({x,y}))))
    const maxError = Math.max(...pixels.map((value,i) => Math.abs(value-f.pixels[i])))
    assert.ok(maxError < 1e-6, `${f.category}: ${maxError}`)
  }
})
test('rasterizer preserves scale, translation and stroke gaps', () => {
  const s = [[{x:10,y:20},{x:90,y:40}], [{x:150,y:20},{x:150,y:70}]]
  const transformed = s.map(stroke => stroke.map(p => ({x:p.x*2+100,y:p.y*2-90})))
  assert.deepEqual(rasterize(s), rasterize(transformed))
  assert.ok(rasterize([]).every(x => x === 0))
})
