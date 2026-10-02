import { test, expect, type Page } from '@playwright/test'

// The real worker/model runs in every test. Timing and error tests can hold
// responses and deliver controlled scores to exercise game rules precisely.
async function start(page: Page, hold = false) {
  await page.addInitScript(({ hold }) => {
    Math.random = () => 0 // circle first, triangle next (no immediate repeats).
    const NativeWorker = window.Worker
    const state = (window as any).roundTest = {
      hold, requests: [] as any[], replies: [] as any[], pending: [] as any[],
      deliver: (_data: any) => {}, fail: () => {},
    }
    window.Worker = function(url: string | URL, options?: WorkerOptions) {
      const worker = new NativeWorker(url, options)
      if (String(url).includes('inference.worker')) {
        const send = worker.postMessage.bind(worker)
        worker.postMessage = (data: any) => {
          if (data.type === 'predict') state.requests.push(structuredClone(data))
          send(data)
        }
        worker.addEventListener('message', e => {
          if (e.data.type !== 'prediction') return
          state.replies.push({ data: e.data, at: performance.now() })
          if (state.hold) { state.pending.push(e.data); e.stopImmediatePropagation() }
        })
        state.deliver = (data: any) => worker.onmessage?.call(worker, new MessageEvent('message', { data }))
        state.fail = () => state.deliver({ type: 'error', message: 'Test inference failure' })
      }
      return worker
    } as unknown as typeof Worker
  }, { hold })
  await page.goto('/')
  await expect(page.locator('#begin')).toBeEnabled({ timeout: 60000 })
  await page.locator('#begin').click()
  await expect(page.locator('#prompt')).toHaveText('Draw a circle')
}

async function circle(page: Page) {
  const b = (await page.locator('#canvas').boundingBox())!
  await page.mouse.move(b.x + b.width * .7, b.y + b.height * .5)
  await page.mouse.down()
  for (let i = 1; i <= 64; i++) {
    const a = i / 64 * Math.PI * 2
    await page.mouse.move(b.x + b.width * (.5 + .2 * Math.cos(a)), b.y + b.height * (.5 + 4 / 15 * Math.sin(a)))
  }
  await page.mouse.up()
}

test('real model wins a round, freezes ink, and Next round resets without repeating the prompt', async ({ page }) => {
  await start(page)
  await circle(page)
  await expect(page.locator('#result')).toContainText("Got it! That's a circle", { timeout: 15000 })
  await expect(page.locator('#start')).toContainText('Next round')
  await expect(page.locator('#next')).toBeFocused()
  const banner = (await page.locator('#result').boundingBox())!
  expect(banner.y + banner.height).toBeLessThanOrEqual((await page.locator('#canvas').boundingBox())!.y)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('#result')).toBeInViewport()
  await expect(page.locator('#next')).toBeInViewport()
  await page.screenshot({ path: '../docs/success-mobile.png', fullPage: true })
  const evidence = await page.evaluate(() => (window as any).roundTest)
  expect(evidence.requests.every((r: any) => !('target' in r))).toBe(true)
  const correct = evidence.replies.filter((r: any) => r.data.probabilities[0] >= .65)
  expect(correct.length).toBeGreaterThanOrEqual(2)
  expect(correct.at(-1).at - correct[0].at).toBeGreaterThanOrEqual(800)
  const ink = await page.locator('#canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())
  await circle(page)
  expect(await page.locator('#canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(ink)
  await page.locator('#next').click()
  await expect(page.locator('#prompt')).toHaveText('Draw a triangle')
  await expect(page.locator('#seconds')).toHaveText('30')
  await expect(page.locator('#result')).toBeHidden()
  await expect(page.locator('#clear')).toBeDisabled()
  await expect(page.locator('#guesses')).toContainText('A few lines')
})

test('late responses from an earlier round cannot change the new round or home screen', async ({ page }) => {
  await start(page, true)
  await circle(page)
  await expect.poll(() => page.evaluate(() => (window as any).roundTest.pending.length)).toBeGreaterThan(0)
  await page.locator('#start').click()
  await circle(page) // New ink must not make the old reply eligible again.
  await page.evaluate(() => {
    const s = (window as any).roundTest
    s.deliver(s.pending[0])
  })
  await expect(page.locator('#guess-title')).toHaveText('I see possibilities.')
  await expect(page.locator('#result')).toBeHidden()
  await expect(page.locator('#prompt')).toHaveText('Draw a triangle')
  await page.locator('#home').click()
  await page.evaluate(() => { const s = (window as any).roundTest; s.deliver(s.pending[0]) })
  await expect(page.locator('#game')).toBeHidden()
  await page.locator('#practice').click()
  await expect(page.locator('#guesses')).toContainText('A few lines')
})

test('correct predictions require confidence and sustained fresh agreement', async ({ page }) => {
  await start(page, true)
  await circle(page)
  await expect.poll(() => page.evaluate(() => (window as any).roundTest.pending.length)).toBeGreaterThan(0)
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  async function score(probability: number, wrong = false) {
    await page.evaluate(({ probability, wrong }) => {
      const s = (window as any).roundTest
      const request = s.requests.at(-1)
      const probabilities = Array(10).fill((1 - probability) / 9)
      probabilities[wrong ? 1 : 0] = probability
      s.deliver({ type: 'prediction', round: request.round, revision: request.revision, probabilities, ms: 1 })
    }, { probability, wrong })
  }
  await score(.64)
  await page.clock.runFor(900)
  await score(.64)
  await expect(page.locator('#result')).toBeHidden()
  await score(.99)
  await page.clock.runFor(450)
  await score(.99, true) // Wrong observations discard accumulated agreement.
  await page.clock.runFor(450)
  await score(.99)
  await expect(page.locator('#result')).toBeHidden()
  await page.clock.runFor(1300) // A stale gap also discards agreement.
  await score(.99)
  await expect(page.locator('#result')).toBeHidden()
  await page.clock.runFor(850)
  await score(.99)
  await expect(page.locator('#result')).toContainText('Got it!')
})

test('deadline beats a delayed correct response and restart clears the result', async ({ page }) => {
  await start(page, true)
  await page.clock.install()
  await page.clock.fastForward(20000)
  await circle(page)
  await expect.poll(() => page.evaluate(() => (window as any).roundTest.pending.length)).toBeGreaterThan(0)
  await page.clock.fastForward(11000)
  await page.evaluate(() => { const s = (window as any).roundTest; s.deliver(s.pending[0]) })
  await expect(page.locator('#result')).toContainText("Time's up!")
  await expect(page.locator('#seconds')).toHaveText('0')
  await page.locator('#start').click()
  await expect(page.locator('#result')).toBeHidden()
  await expect(page.locator('#seconds')).toHaveText('30')
})

test('inference failure stops the round, ignores late replies, and leaves drawing usable', async ({ page }) => {
  await start(page, true)
  await circle(page)
  await expect.poll(() => page.evaluate(() => (window as any).roundTest.pending.length)).toBeGreaterThan(0)
  // Drain a possibly partial-stroke response so the next reply matches final ink.
  await page.evaluate(() => { const s = (window as any).roundTest; s.deliver(s.pending[0]) })
  await expect.poll(() => page.evaluate(() => (window as any).roundTest.pending.length)).toBeGreaterThan(1)
  await page.evaluate(() => {
    const s = (window as any).roundTest
    s.fail(); s.deliver(s.pending.at(-1))
  })
  await expect(page.locator('#result')).toContainText('Round stopped')
  await expect(page.locator('#model-status')).toContainText('Recognition unavailable')
  await expect(page.locator('#start')).toBeDisabled()
  await page.locator('#clear').click()
  await circle(page)
  await expect(page.locator('#clear')).toBeEnabled()
})

test('camera is beside the board on desktop and a compact dock above it on mobile', async ({ page }) => {
  await start(page)
  const desktopCamera = (await page.locator('.camera-panel').boundingBox())!
  const desktopBoard = (await page.locator('.play-area').boundingBox())!
  const desktopGuess = (await page.locator('.guess-panel').boundingBox())!
  expect(desktopCamera.x).toBeGreaterThanOrEqual(desktopBoard.x + desktopBoard.width)
  expect(desktopCamera.y).toBeLessThan(desktopGuess.y)
  await page.setViewportSize({ width: 390, height: 844 })
  const camera = (await page.locator('.camera-panel').boundingBox())!
  const canvas = (await page.locator('#canvas').boundingBox())!
  expect(camera.y + camera.height).toBeLessThanOrEqual(canvas.y)
  expect(camera.height).toBeLessThan(150)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('#camera').click()
  await expect(page.locator('#camera')).toHaveText('Disable camera', { timeout: 60000 })
  await page.screenshot({ path: '../docs/camera-mobile.png', fullPage: true })
  await page.evaluate(() => scrollTo(0, 240))
  expect((await page.locator('.camera-panel').boundingBox())!.y).toBeGreaterThanOrEqual(0)
})
