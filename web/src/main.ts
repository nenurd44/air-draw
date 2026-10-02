import './style.css'
import './start-screen.css'
import { CATEGORIES, Drawing, StableGuess, type Point } from './drawing'
import { Camera } from './camera'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><a class="brand" href="./"><span class="brand-icon" aria-hidden="true">〰</span> air draw</a></header>
<main>
<section id="welcome" class="welcome" aria-labelledby="welcome-title">
<h1 id="welcome-title">ready to draw?</h1><p>get a word, then draw it in <strong>30 seconds</strong>.<br>the ai will try to guess your drawing.</p>
<div class="welcome-steps"><span><b>1</b> Press Start</span><span><b>2</b> See your word</span><span><b>3</b> Draw it!</span></div>
<button id="begin" class="primary" disabled>Getting ready…</button><p id="welcome-status" role="status">Loading the drawing model…</p>
<button id="practice" class="practice-link">Just practice — no timer</button><p class="welcome-note">Use your mouse or finger. You can also enable your camera to draw in the air.</p>
</section>
<div id="board-nav" class="board-nav" hidden><button id="home" class="secondary">← back to start</button></div>
<section id="game" class="game" aria-label="Air Draw game" hidden><div class="play-area">
<div class="prompt-bar"><div><span class="eyebrow" id="round-label">THE CANVAS IS YOURS</span><h2 id="prompt">Warm up your imagination</h2></div><div class="timer" role="timer" aria-label="Seconds remaining"><span id="seconds">30</span><small>SEC</small></div></div>
<div id="result" role="status" hidden><span id="result-message"></span><button id="next" class="primary">Next round →</button></div>
<div class="canvas-wrap"><canvas id="canvas" width="800" height="600" aria-label="drawing canvas. drag with a mouse or finger to draw."></canvas><div id="canvas-hint"><strong>draw here</strong><span>drag with your mouse or finger, or enable the camera.</span></div><div id="cursor" hidden></div><span class="canvas-label">your drawing</span><span id="pen-status" class="pen-status">mouse / touch</span></div>
<div class="toolbar"><div><button id="undo" class="secondary" disabled>↶ <span>Undo</span></button><button id="clear" class="secondary" disabled>× <span>Clear</span></button></div><button id="start" class="primary" disabled>Loading model…</button></div></div>
<aside><section class="guess-panel"><div class="panel-heading"><span class="eyebrow">predictions</span></div><h3 id="guess-title">I see possibilities.</h3><p id="model-status" role="status">Loading the drawing model…</p><ol id="guesses" aria-label="top three predictions"><li class="empty-guess">A few lines will get me started.</li></ol></section>
<section class="camera-panel" aria-label="camera"><div class="panel-heading"><span class="eyebrow">camera</span></div><div class="preview"><video id="video" autoplay playsinline muted></video><div id="camera-placeholder"><span>☝</span><strong>draw with your index finger</strong><span>pinch to draw, release to stop.</span></div></div><button id="camera" class="camera-button">Enable camera</button><p id="camera-status" role="status">Camera is off. Mouse drawing is ready.</p></section>
<section class="instructions-panel" aria-labelledby="help-title"><h3 id="help-title">how to draw</h3><ul><li><strong>mouse or touch:</strong> drag on the board. lift to stop.</li><li><strong>camera:</strong> allow access, show one hand, and pinch your thumb and index finger to draw. separate them to lift the pen.</li><li><strong>fix a line:</strong> undo removes the last stroke; clear erases the board.</li><li><strong>finish a round:</strong> draw the word before time runs out. a green message means the ai got it.</li></ul><details><summary>what can i draw?</summary><p>${CATEGORIES.join(' · ')}</p><p>the model knows only these ten categories. scores are relative guesses, not certainty.</p></details></section>
</aside></section>
</main><footer><a href="https://github.com/googlecreativelab/quickdraw-dataset" target="_blank" rel="noreferrer">drawing data: google quick, draw! · cc by 4.0</a></footer>`

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const canvas = $<HTMLCanvasElement>('canvas'), ctx = canvas.getContext('2d')!
const drawing = new Drawing(), stable = new StableGuess()
const base = new URL(import.meta.env.BASE_URL, location.href).href
let round = 0, playing = false, finished = false, deadline = 0, target = '', lastTarget = ''
let mouseDown = false, airDown = false
let modelReady = false, inferenceBusy = false, lastInferred = -1, lastConfirmation = 0
let inferenceSent = 0, lastTop = ''
const inference = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' })
$('prompt').tabIndex = -1
$('prompt').setAttribute('aria-live', 'polite')
const instructions = document.createElement('p')
instructions.className = 'drawing-instructions'
instructions.textContent = 'Drag to draw. Or enable your camera: pinch to draw, release to lift the pen.'
$('prompt').after(instructions)
function showBoard() {
  $('welcome').hidden = true; $('game').hidden = false; $('board-nav').hidden = false
  document.body.classList.add('drawing-view')
  redraw(); $('prompt').focus({ preventScroll: true }); window.scrollTo(0, 0)
}
$('practice').onclick = () => {
  $('round-label').textContent = 'NO TIMER · JUST EXPLORING'
  $('prompt').textContent = 'Draw anything you like'
  document.querySelector<HTMLElement>('.timer')!.hidden = true
  showBoard()
}
$('home').onclick = () => {
  playing = false; finished = false; round++; mouseDown = false; endAir()
  camera.stop(); drawing.clear(); resetGuesses(); $('result').hidden = true
  $('start').textContent = modelReady ? 'Start a round ↗' : 'Model unavailable'
  $('game').hidden = true; $('board-nav').hidden = true; $('welcome').hidden = false
  document.body.classList.remove('drawing-view')
  $(modelReady ? 'begin' : 'practice').focus({ preventScroll: true }); window.scrollTo(0, 0)
}
function redraw() {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2)
  if (!rect.width || !rect.height) return
  const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr)
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
  ctx.setTransform(width / 800, 0, 0, height / 600, 0, 0)
  ctx.clearRect(0, 0, 800, 600)
  ctx.strokeStyle = '#292b31'; ctx.fillStyle = '#292b31'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const stroke of drawing.strokes) {
    if (!stroke.length) continue
    ctx.beginPath(); ctx.moveTo(stroke[0].x, stroke[0].y)
    for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
    if (stroke.length === 1) { ctx.beginPath(); ctx.arc(stroke[0].x, stroke[0].y, 2, 0, Math.PI * 2); ctx.fill() }
  }
  $('canvas-hint').hidden = drawing.strokes.length > 0
  $<HTMLButtonElement>('undo').disabled = $<HTMLButtonElement>('clear').disabled = !drawing.strokes.length
}
new ResizeObserver(redraw).observe(canvas)
function endAir() { if (airDown) drawing.end(); airDown = false }
const camera = new Camera(base, (point, down) => {
  if (!point) { endAir(); return }
  if (mouseDown || finished) return
  if (down && !airDown) drawing.begin(point)
  else if (down) drawing.move(point)
  else if (airDown) drawing.end()
  airDown = down; redraw()
})
const point = (event: PointerEvent): Point => {
  const r = canvas.getBoundingClientRect()
  return { x: Math.max(0, Math.min(800, (event.clientX - r.left) / r.width * 800)), y: Math.max(0, Math.min(600, (event.clientY - r.top) / r.height * 600)) }
}
canvas.addEventListener('pointerdown', e => {
  if (finished || e.button !== 0 || mouseDown) return
  e.preventDefault(); endAir(); mouseDown = true; canvas.setPointerCapture(e.pointerId); drawing.begin(point(e)); redraw()
})
canvas.addEventListener('pointermove', e => { if (mouseDown) { drawing.move(point(e)); redraw() } })
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { mouseDown = false; drawing.end() })
function resetGuesses() { stable.reset(); lastTop = ''; lastConfirmation = 0; $('guesses').innerHTML = '<li class="empty-guess">A few lines will get me started.</li>'; $('guess-title').textContent = 'I see possibilities.' }
for (const action of ['clear', 'undo'] as const) $(action).onclick = () => { endAir(); mouseDown = false; drawing[action](); resetGuesses(); redraw() }
function finish(success: boolean) {
  if (!playing) return
  playing = false; finished = true; mouseDown = false; drawing.end(); endAir()
  $('result').hidden = false; $('result').className = success ? 'success' : 'timeout'
  $('result-message').textContent = success ? `✓ Got it! That's ${/^[aeiou]/.test(target) ? 'an' : 'a'} ${target}. Nicely drawn.` : `Time's up! The prompt was ${target}. ${lastTop ? `My last guess was ${lastTop}.` : 'Try a bold outline next time.'}`
  $('next').hidden = false; $('next').focus({ preventScroll: true }); window.scrollTo(0, 0)
  $('start').textContent = 'Next round ↗'; $('round-label').textContent = success ? 'correct drawing' : 'round finished'
}
function startRound() {
  if (!modelReady) return
  const choices = CATEGORIES.filter(c => c !== lastTarget)
  target = choices[Math.floor(Math.random() * choices.length)]; lastTarget = target
  round++; playing = true; finished = false; deadline = performance.now() + 30000
  endAir(); mouseDown = false; drawing.clear(); resetGuesses(); redraw()
  $('prompt').textContent = `Draw ${/^[aeiou]/.test(target) ? 'an' : 'a'} ${target}`; $('round-label').textContent = `ROUND ${String(round).padStart(2, '0')} · YOUR CHALLENGE`
  $('seconds').textContent = '30'; $('start').textContent = 'Restart round ↗'; $('result').hidden = true
  document.querySelector<HTMLElement>('.timer')!.hidden = false
  showBoard()
}
$('start').onclick = startRound
$('begin').onclick = startRound
$('next').onclick = startRound
function modelError(message: string) {
  modelReady = false; inferenceBusy = false
  inference.terminate()
  if (playing) { playing = false; finished = false; $('result').hidden = false; $('result').className = 'timeout'; $('next').hidden = true; $('result-message').textContent = 'Round stopped because recognition is unavailable. Reload to retry; you can still sketch.' }
  $('model-status').textContent = `Recognition unavailable. Reload to retry. ${message}`
  $('start').textContent = 'Model unavailable'; $<HTMLButtonElement>('start').disabled = true
  $('begin').textContent = 'Game unavailable'; $<HTMLButtonElement>('begin').disabled = true
  $('welcome-status').textContent = 'Recognition could not load. Reload to retry, or choose Just practice to sketch.'
}
inference.onerror = e => modelError(e.message)
inference.onmessage = event => {
  const msg = event.data
  if (msg.type === 'ready') {
    modelReady = true; $('model-status').textContent = 'Ready when you are. Start sketching.'
    $('start').textContent = 'Start a round ↗'; $<HTMLButtonElement>('start').disabled = false
    $('begin').textContent = 'Start drawing →'; $<HTMLButtonElement>('begin').disabled = false
    $('welcome-status').textContent = 'Ready when you are. No camera required.'
  } else if (msg.type === 'error') modelError(msg.message)
  else if (msg.type === 'prediction') {
    if (!modelReady) return
    inferenceBusy = false
    if (msg.round !== round || msg.revision !== drawing.revision || !drawing.hasInk || finished) return
    const predictions = (msg.probabilities as number[]).map((probability, index) => ({ label: CATEGORIES[index], probability })).sort((a,b) => b.probability - a.probability).slice(0,3)
    lastTop = predictions[0].label
    $('guess-title').textContent = `Is it a ${lastTop}?`
    $('guesses').innerHTML = predictions.map((p,i) => `<li><span class="guess-rank">0${i+1}</span><div><span>${p.label}</span><div class="bar"><i style="width:${p.probability*100}%"></i></div></div><span class="confidence">${Math.round(p.probability*100)}%</span></li>`).join('')
    $('model-status').textContent = `${Math.round(msg.ms)} ms to guess${camera.ready ? ` · ${Math.round(camera.ms)} ms to track` : ''}. Keep your lines simple.`
    if (playing) {
      if (performance.now() >= deadline) { finish(false); return }
      const correct = lastTop === target && predictions[0].probability >= .65
      lastConfirmation = correct ? performance.now() : 0
      if (stable.update(correct, performance.now())) finish(true)
    }
  }
}
inference.postMessage({ type: 'init', base })
const modelTimeout = setTimeout(() => { if (!modelReady) modelError('Loading took too long; check local model assets.') }, 60000)
setInterval(() => {
  if (inferenceBusy && performance.now() - inferenceSent > 15000) { inference.terminate(); modelError('Inference timed out.'); return }
  const confirmation = playing && lastConfirmation > 0 && performance.now() - lastConfirmation < 1500
  if (!modelReady || inferenceBusy || !drawing.hasInk || finished || (drawing.revision === lastInferred && !confirmation)) return
  inferenceBusy = true; inferenceSent = performance.now(); lastInferred = drawing.revision
  inference.postMessage({ type: 'predict', strokes: drawing.strokes, revision: drawing.revision, round })
}, 350)
function animation(now: number) {
  requestAnimationFrame(animation)
  if (playing) { $('seconds').textContent = String(Math.max(0, Math.ceil((deadline-now)/1000))); if (now >= deadline) finish(false) }
  camera.frame(now)
}
requestAnimationFrame(animation)
document.addEventListener('visibilitychange', () => { if (document.hidden) { endAir(); drawing.end(); mouseDown = false; camera.reset() } else if (playing && performance.now() >= deadline) finish(false) })
window.addEventListener('pagehide', () => { camera.stop(); inference.terminate(); clearTimeout(modelTimeout) })
