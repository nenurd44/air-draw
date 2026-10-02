import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rasterize } from '../src/drawing.ts'

test('Python and browser rasterizers match held-out examples for all 10 classes', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'))
  assert.equal(fixtures.length, 10)
  for (const f of fixtures) {
    const pixels = rasterize(f.strokes.map((s: number[][]) => s.map(([x,y]) => ({x,y}))))
    const maxError = Math.max(...pixels.map((value,i) => Math.abs(value-f.pixels[i])))
    assert.ok(maxError < 1e-6, `${f.category}: ${maxError}`)
  }
})
