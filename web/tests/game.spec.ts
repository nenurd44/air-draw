import { test, expect, type Page } from '@playwright/test'

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.locator('#start')).toBeEnabled({ timeout: 60000 })
}
async function circle(page: Page) {
  const box = (await page.locator('#canvas').boundingBox())!
  await page.mouse.move(box.x + box.width*.7, box.y + box.height*.5)
  await page.mouse.down()
  for (let i = 1; i <= 64; i++) {
    const a = i / 64 * Math.PI * 2
    await page.mouse.move(box.x + box.width*(.5+.2*Math.cos(a)), box.y + box.height*(.5+.2666667*Math.sin(a)))
  }
  await page.mouse.up()
}
test('real ONNX mouse prediction, undo, clear, resize, and mobile layout', async ({page}) => {
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:4173') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()) })
  await ready(page)
  await circle(page)
  await expect(page.locator('#guess-title')).toHaveText('Is it a circle?', {timeout:15000})
  await expect(page.locator('#guesses li')).toHaveCount(3)
  await page.screenshot({path:'../docs/desktop.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await expect(page.locator('#clear')).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path:'../docs/mobile.png',fullPage:true})
  await page.locator('#undo').click()
  await expect(page.locator('#canvas-hint')).toBeVisible()
  await expect(page.locator('#guesses')).toContainText('A few lines')
  await circle(page)
  await page.locator('#clear').click()
  await expect(page.locator('#undo')).toBeDisabled()
  expect(errors).toEqual([]); expect(external).toEqual([])
})
test('timer expires, result appears, restart resets canvas', async ({page}) => {
  await ready(page)
  await page.clock.install()
  await page.locator('#start').click()
  await expect(page.locator('#prompt')).toContainText('Draw a ')
  await page.clock.fastForward(31000)
  await expect(page.locator('#result')).toContainText("Time's up!")
  await page.locator('#start').click()
  await expect(page.locator('#seconds')).toHaveText('30')
  await expect(page.locator('#result')).toBeHidden()
})
test('real tracker initializes, handles no hand, and releases tracks while ONNX runs', async ({page}) => {
  await ready(page)
  await page.locator('#camera').click()
  await expect(page.locator('#camera')).toHaveText('Disable camera', {timeout:60000})
  await expect(page.locator('#camera-status')).toContainText('No hand', {timeout:30000})
  await page.evaluate(() => {
    (window as any).testTracks = ((document.getElementById('video') as HTMLVideoElement).srcObject as MediaStream).getTracks()
    ;(window as any).frameIntervals = []
    let previous = performance.now()
    const tick = (now: number) => { (window as any).frameIntervals.push(now-previous); previous = now; if ((window as any).frameIntervals.length < 180) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  await circle(page)
  await expect(page.locator('#guess-title')).toHaveText('Is it a circle?', {timeout:15000})
  await page.waitForTimeout(3500)
  const timing = await page.evaluate(() => {
    const sorted = ((window as any).frameIntervals as number[]).sort((a,b)=>a-b)
    return {samples:sorted.length,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)}
  })
  console.log('Concurrent tracker/inference UI frame timing:', JSON.stringify(timing))
  expect(timing.samples).toBeGreaterThan(60)
  expect(timing.p95).toBeLessThan(150)
  await page.locator('#camera').click()
  expect(await page.evaluate(() => (window as any).testTracks.every((t:MediaStreamTrack) => t.readyState === 'ended'))).toBe(true)
  await expect(page.locator('#camera-status')).toContainText('Camera is off')
})
test('camera denied or absent gives an actionable fallback', async ({page}) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test denial', 'NotAllowedError') } })
  await ready(page); await page.locator('#camera').click()
  await expect(page.locator('#camera-status')).toContainText('permission was denied')
  await circle(page)
  await expect(page.locator('#guess-title')).toHaveText('Is it a circle?', {timeout:15000})
})
test('missing classifier fails honestly without invented predictions', async ({page}) => {
  await page.route('**/models/air-draw.onnx', route => route.abort())
  await page.goto('/')
  await expect(page.locator('#model-status')).toContainText('Recognition unavailable', {timeout:60000})
  await expect(page.locator('#start')).toBeDisabled()
  await circle(page)
  await expect(page.locator('#guesses')).toContainText('A few lines')
})
