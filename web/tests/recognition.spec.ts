import { test, expect, type Page } from '@playwright/test'

// Test-only observation/delivery controls. Inference always uses the real worker
// and ONNX model; only landmark input and response timing can be controlled.
async function observe(page: Page, syntheticTracking = false) {
  await page.addInitScript(({ syntheticTracking }) => {
    const nativeWorker = window.Worker
    const state = (window as any).recognitionTest = {
      requests: [] as any[], held: [] as any[], hold: false,
      emit: (_points: any) => {}, release: () => {},
    }
    window.Worker = function(url: string | URL, options?: WorkerOptions) {
      if (syntheticTracking && String(url).endsWith('/tracker.js')) {
        const tracker = {
          onmessage: null as any, onerror: null,
          postMessage(message: any) {
            if (message.type === 'init') queueMicrotask(() => tracker.onmessage?.({ data: { type: 'ready' } }))
            if (message.type === 'frame') message.bitmap.close()
          },
          terminate() { state.emit = () => {} },
        }
        state.emit = (points: any) => tracker.onmessage?.({ data: { type: 'landmarks', points, ms: 1 } })
        return tracker
      }
      const worker = new nativeWorker(url, options)
      if (String(url).includes('inference.worker')) {
        const send = worker.postMessage.bind(worker)
        worker.postMessage = (message: any) => {
          if (message.type === 'predict') state.requests.push(structuredClone(message))
          send(message)
        }
        worker.addEventListener('message', event => {
          if (event.data.type === 'prediction' && state.hold) {
            state.held.push(event.data)
            event.stopImmediatePropagation()
          }
        })
        state.release = () => {
          state.hold = false
          for (const data of state.held.splice(0)) worker.dispatchEvent(new MessageEvent('message', { data }))
        }
      }
      return worker
    } as unknown as typeof Worker
  }, { syntheticTracking })
  await page.goto('/')
  await expect(page.locator('#start')).toBeEnabled({ timeout: 60000 })
}

async function mouseCircle(page: Page) {
  const b = (await page.locator('#canvas').boundingBox())!
  await page.mouse.move(b.x + b.width * .7, b.y + b.height * .5)
  await page.mouse.down()
  for (let i = 1; i <= 64; i++) {
    const a = i / 64 * Math.PI * 2
    await page.mouse.move(b.x + b.width * (.5 + .2 * Math.cos(a)), b.y + b.height * (.5 + 4 / 15 * Math.sin(a)))
  }
  await page.mouse.up()
}

async function landmark(page: Page, x: number, y: number, down: boolean) {
  await page.evaluate(({ x, y, down }) => {
    const points = Array.from({ length: 21 }, () => ({ x: .5, y: .5 }))
    points[0] = { x: .5, y: .8 }; points[9] = { x: .5, y: .6 }
    points[8] = { x: 1 - x / 800, y: y / 600 }
    points[4] = { x: points[8].x + (down ? .005 : .2), y: points[8].y }
    ;(window as any).recognitionTest.emit(points)
  }, { x, y, down })
}

test('@recognition air landmark input uses pinch, mirroring and real ONNX recognition', async ({ page }) => {
  await observe(page, true)
  await page.locator('#camera').click()
  await expect(page.locator('#camera')).toHaveText('Disable camera')
  await landmark(page, 560, 300, false)
  await expect(page.locator('#pen-status')).toContainText('PEN UP')
  await expect(page.locator('#clear')).toBeDisabled()
  await landmark(page, 560, 300, true)
  await expect(page.locator('#pen-status')).toContainText('PEN DOWN')
  for (let i = 1; i <= 64; i++) {
    const a = i / 64 * Math.PI * 2
    await landmark(page, 400 + 160 * Math.cos(a), 300 + 160 * Math.sin(a), true)
  }
  await landmark(page, 560, 300, false)
  await expect(page.locator('#guess-title')).toHaveText('Is it a circle?', { timeout: 15000 })
  const request = await page.evaluate(() => (window as any).recognitionTest.requests.at(-1))
  expect(request.strokes).toHaveLength(1)
  expect(request.strokes[0][0]).toEqual({ x: 560, y: 300 })
  expect(request).not.toHaveProperty('target')
  await page.evaluate(() => (window as any).recognitionTest.emit(null))
  await expect(page.locator('#cursor')).toBeHidden()
  await landmark(page, 100, 100, false)
  await landmark(page, 100, 100, true)
  await landmark(page, 140, 100, true)
  await landmark(page, 140, 100, false)
  await expect.poll(() => page.evaluate(() => (window as any).recognitionTest.requests.at(-1).strokes.length)).toBe(2)
  await page.locator('#undo').click()
  await expect(page.locator('#guess-title')).toHaveText('Is it a circle?', { timeout: 15000 })
  await page.locator('#clear').click()
  await expect(page.locator('#guesses')).toContainText('A few lines')
  await page.locator('#camera').click()
})

for (const action of ['clear', 'undo'] as const) {
  test(`@recognition delayed real prediction is discarded after ${action}; new ink is recognized`, async ({ page }) => {
    await observe(page)
    await page.evaluate(() => { (window as any).recognitionTest.hold = true })
    await mouseCircle(page)
    await expect.poll(() => page.evaluate(() => (window as any).recognitionTest.held.length)).toBeGreaterThan(0)
    await page.locator(`#${action}`).click()
    await page.evaluate(() => (window as any).recognitionTest.release())
    await expect(page.locator('#guess-title')).toHaveText('I see possibilities.')
    await expect(page.locator('#guesses')).toContainText('A few lines')
    await mouseCircle(page)
    await expect(page.locator('#guess-title')).toHaveText('Is it a circle?', { timeout: 15000 })
  })
}

test('@recognition empty canvas and a single tap do not invoke recognition', async ({ page }) => {
  await observe(page)
  await page.locator('#canvas').click()
  await page.waitForTimeout(800) // More than two inference polling intervals.
  expect(await page.evaluate(() => (window as any).recognitionTest.requests)).toHaveLength(0)
  await expect(page.locator('#guesses')).toContainText('A few lines')
})
