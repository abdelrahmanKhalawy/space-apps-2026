// Draws the hologram picture on a canvas and runs the camera: the Stitch figure (a glowing see-through body with a
// skeleton and organs) as the hero, with our own live layer on top: organ glows in the status colors, a heartbeat,
// a scan band, floating dust, numbered callouts, and a camera that flies to the part you pick (an arc with a sideways
// swing, a pull-back and a tilt) and keeps a slow handheld drift. No library.
import heroUrl from './hologram.webp'
import {
  IMG, OVERVIEW, ORGAN_ORDER, ORGAN_SPOTS, ORGAN_SHAPES, ORGAN_LABELS, ORGAN_NUMBERS, ANCHORS,
  makeView, poseFor, startFlight, poseAt, hitOrgan,
} from './holo.js'

const COLORS = { green: [61, 220, 132], yellow: [255, 204, 77], red: [255, 93, 93], none: [120, 132, 175] }
const WORDS = { green: 'HEALTHY', yellow: 'WATCH', red: 'ACT NOW', none: 'NO DATA' }
const TAU = Math.PI * 2
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const MONO = "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Menlo, Consolas, monospace"

const heartbeat = t => {
  // a double pulse every ~0.85 s (about 70 bpm)
  const p = (t % 0.85) / 0.85
  return Math.exp(-Math.pow((p - 0.08) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((p - 0.28) / 0.07, 2))
}

export function createHoloRenderer(canvas, { onSelect }) {
  const ctx = canvas.getContext('2d')
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  const img = new Image()
  let ready = false
  img.onload = () => {
    ready = true
    // a small copy to read brightness from, so a click on the body (and not on the dark) selects the skin
    mask = document.createElement('canvas')
    mask.width = IMG.w / 4
    mask.height = IMG.h / 4
    mask.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, mask.width, mask.height)
  }
  img.src = heroUrl
  let mask = null

  let W = 0
  let H = 0
  let dpr = 1
  let raf = 0
  let visible = true
  let destroyed = false

  const state = { organs: [], selected: null, pulsing: new Set() }
  const statusOf = id => state.organs.find(o => o.id === id)?.color ?? 'none'
  const pulseAt = {}
  let pose = { ...OVERVIEW }
  let goal = { ...OVERVIEW }
  let flight = null
  let side = 1
  let lastSelected = null
  const startedAt = performance.now()

  // pointer: hover nudges the scene a little (depth), dragging pans it and it eases back
  const drag = { x: 0, y: 0, down: false, moved: false, px: 0, py: 0, releasedAt: 0 }
  const hoverPos = { x: 0, y: 0, tx: 0, ty: 0 }
  let hover = null
  let view = makeView(pose, 1, 1)

  const dust = Array.from({ length: 70 }, (_, i) => ({
    x: 230 + ((i * 97) % 440),
    y: 120 + ((i * 211) % 960),
    v: 6 + ((i * 17) % 11),
    ph: i,
    s: 1 + ((i * 7) % 3),
  }))

  function resize() {
    const r = canvas.getBoundingClientRect()
    W = Math.max(1, Math.round(r.width))
    H = Math.max(1, Math.round(r.height))
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
  }

  function update(next) {
    state.organs = next.organs
    state.pulsing = next.pulsing
    const now = performance.now() / 1000
    next.pulsing.forEach(id => {
      if (pulseAt[id] === undefined || now - pulseAt[id] > 1.2) pulseAt[id] = now
    })
    if (next.selected !== lastSelected) {
      lastSelected = next.selected
      state.selected = next.selected
      side = -side
      goal = next.selected && ORGAN_SPOTS[next.selected] ? poseFor(next.selected) : { ...OVERVIEW }
      if (reduced) {
        pose = { ...goal }
        flight = null
      } else {
        flight = startFlight({ ...pose, roll: 0, swing: 0 }, goal, performance.now(), side)
      }
    }
  }

  const setImageTransform = () => {
    const m = view.matrix
    ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr)
  }
  const setScreenTransform = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // The picked organ cut out of the picture with a soft edge, drawn over the veil so it stays crisp
  let layer = null
  let layerFor = null
  function clearLayer(id) {
    if (layerFor === id) return layer
    const o = ORGAN_SPOTS[id]
    layer = layer ?? document.createElement('canvas')
    layer.width = IMG.w
    layer.height = IMG.h
    const g = layer.getContext('2d')
    g.drawImage(img, 0, 0)
    g.globalCompositeOperation = 'destination-in'
    g.translate(o.c[0], o.c[1])
    g.scale(o.r[0] * 1.3, o.r[1] * 1.3)
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1)
    grad.addColorStop(0, 'rgba(0,0,0,1)')
    grad.addColorStop(0.55, 'rgba(0,0,0,1)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(-1.1, -1.1, 2.2, 2.2)
    layerFor = id
    return layer
  }

  function glow(c, x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, rgba(c, a))
    g.addColorStop(0.5, rgba(c, a * 0.35))
    g.addColorStop(1, rgba(c, 0))
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // ---- layers ----
  function drawPicture(t) {
    const sel = state.selected
    setImageTransform()
    ctx.imageSmoothingQuality = 'high'
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(img, 0, 0)
    ctx.globalAlpha = 1
    if (sel && ORGAN_SPOTS[sel]) {
      // the other organs step back: a dark veil over them, then the picked organ is drawn again on top, clear
      ctx.globalCompositeOperation = 'source-over'
      for (const id of ORGAN_ORDER) {
        if (id === sel) continue
        const o = ORGAN_SPOTS[id]
        const g = ctx.createRadialGradient(o.c[0], o.c[1], 0, o.c[0], o.c[1], Math.max(...o.r) * 1.25)
        g.addColorStop(0, 'rgba(3,8,20,0.78)')
        g.addColorStop(0.75, 'rgba(3,8,20,0.6)')
        g.addColorStop(1, 'rgba(3,8,20,0)')
        ctx.fillStyle = g
        ctx.fillRect(o.c[0] - o.r[0] * 1.6, o.c[1] - o.r[1] * 1.6, o.r[0] * 3.2, o.r[1] * 3.2)
      }
      ctx.drawImage(clearLayer(sel), 0, 0)
    }
  }

  // Each organ glows in its live status color, on top of the picture
  function drawStatusGlows(t) {
    const sel = state.selected
    ctx.globalCompositeOperation = 'lighter'
    for (const id of ORGAN_ORDER) {
      const o = ORGAN_SPOTS[id]
      const col = COLORS[statusOf(id)]
      const isSel = sel === id
      const flash = pulseAt[id] !== undefined ? Math.max(0, 1 - (t - pulseAt[id]) / 1.1) : 0
      let beat = 0
      if (!reduced) {
        if (id === 'heart') beat = heartbeat(t)
        else if (id === 'lungs') beat = 0.5 + 0.5 * Math.sin((t * TAU) / 4.2)
        else if (id === 'brain') beat = 0.5 + 0.5 * Math.sin(t * 1.3)
        else beat = 0.5 + 0.5 * Math.sin((t * TAU) / 6)
      }
      const quiet = sel && !isSel ? 0.25 : 1
      const a = (0.13 + 0.16 * beat + 0.3 * flash + (isSel ? 0.12 : 0)) * quiet
      glow(col, o.c[0], o.c[1], Math.max(...o.r) * (isSel ? 1.9 : 1.6), a)
      if (hover === id) glow(col, o.c[0], o.c[1], Math.max(...o.r) * 1.7, 0.2)
    }
    // the heart sends out a ripple on every beat
    if (!reduced && !(sel && sel !== 'heart')) {
      const h = ORGAN_SPOTS.heart
      const p = (t % 0.85) / 0.85
      ctx.beginPath()
      ctx.arc(h.c[0], h.c[1], 20 + p * 90, 0, TAU)
      ctx.strokeStyle = rgba(COLORS[statusOf('heart')], (1 - p) * 0.35)
      ctx.lineWidth = 2 / view.scale
      ctx.stroke()
    }
  }

  // Each organ outlined in its status color, so they read clearly apart (the heart sits over the lungs)
  function smoothPath(poly) {
    const n = poly.length
    ctx.moveTo((poly[n - 1][0] + poly[0][0]) / 2, (poly[n - 1][1] + poly[0][1]) / 2)
    for (let i = 0; i < n; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % n]
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
    }
  }
  function drawOutlines(t) {
    const sel = state.selected
    ctx.globalCompositeOperation = 'source-over'
    // the heart is drawn last so its outline stays on top of the lungs
    for (const id of ['lungs', 'metabolism', 'brain', 'heart']) {
      const col = COLORS[statusOf(id)]
      const isSel = sel === id
      const quiet = sel && !isSel ? 0.22 : 1
      const beat = reduced ? 0 : id === 'heart' ? heartbeat(t) : 0.5 + 0.5 * Math.sin(t * 1.3 + id.length)
      for (const poly of ORGAN_SHAPES[id]) {
        ctx.beginPath()
        smoothPath(poly)
        ctx.closePath()
        ctx.fillStyle = rgba(col, (0.1 + 0.07 * beat + (isSel ? 0.1 : 0) + (hover === id ? 0.08 : 0)) * quiet)
        ctx.fill()
        ctx.shadowColor = rgba(col, 0.9 * quiet)
        ctx.shadowBlur = (isSel ? 14 : 8) * dpr
        ctx.strokeStyle = rgba(col, (isSel ? 1 : 0.85) * quiet)
        ctx.lineWidth = Math.max(1.4 / view.scale, (isSel ? 2.4 : 1.6) / view.scale)
        if (isSel && !reduced) {
          ctx.setLineDash([10, 6])
          ctx.lineDashOffset = -t * 14
        }
        ctx.stroke()
        ctx.setLineDash([])
        ctx.shadowBlur = 0
      }
    }
  }

  // The scan band sweeping down the body, and the dust floating up around it
  function drawScan(t) {
    if (reduced) return
    ctx.globalCompositeOperation = 'lighter'
    const y = 70 + ((t * 0.17) % 1.1) * 1010
    const k = state.selected ? 0.45 : 1
    for (let i = 0; i < 6; i++) {
      // the ring and a trail of fainter rings above it
      ctx.beginPath()
      ctx.ellipse(448, y - i * 9, 228, 34, 0, 0, TAU)
      ctx.strokeStyle = `rgba(160,232,255,${(i === 0 ? 0.75 : 0.22 / i) * k})`
      ctx.lineWidth = (i === 0 ? 2.2 : 1.2) / Math.max(view.scale, 0.2)
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(170,215,255,0.9)'
    for (const d of dust) {
      d.y -= d.v * 0.016
      if (d.y < 90) d.y = 1000
      const a = 0.25 + 0.35 * Math.sin(t * 1.7 + d.ph)
      ctx.globalAlpha = clamp(a, 0, 0.7)
      const s = d.s / Math.max(view.scale, 0.2) * 0.9
      ctx.fillRect(d.x + Math.sin(t * 0.6 + d.ph) * 6, d.y, s, s)
    }
    ctx.globalAlpha = 1
  }

  // Everything below is drawn in screen pixels: the HUD on the picked part, and the numbered callouts
  function drawFocus(t) {
    const sel = state.selected
    const o = ORGAN_SPOTS[sel]
    if (!o) return
    const col = COLORS[statusOf(sel)]
    const zoomed = clamp((pose.zoom - 1.12) / 0.9, 0, 1)
    const [sx, sy] = view.toScreen(o.c[0], o.c[1])
    const R = Math.max(...o.r) * view.scale
    ctx.globalCompositeOperation = 'lighter'
    for (const ph of [0, 0.5]) {
      const p = reduced ? 0.3 : (t * 0.7 + ph) % 1
      ctx.beginPath()
      ctx.arc(sx, sy, Math.min(R, Math.min(W, H) * 0.3) * (1.2 + 0.9 * p), 0, TAU)
      ctx.strokeStyle = rgba(col, (1 - p) * 0.55 * zoomed)
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    const s = Math.min(R * 1.5, Math.min(W, H) * 0.4)
    const g = s * 0.35
    ctx.strokeStyle = rgba(col, 0.9 * zoomed)
    ctx.lineWidth = 1.6
    ctx.beginPath()
    for (const [kx, ky] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.moveTo(sx + kx * s, sy + ky * (s - g))
      ctx.lineTo(sx + kx * s, sy + ky * s)
      ctx.lineTo(sx + kx * (s - g), sy + ky * s)
    }
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    ctx.font = `700 ${Math.round(11 + H / 120)}px ${MONO}`
    ctx.textAlign = 'center'
    ctx.fillStyle = rgba(col, zoomed)
    ctx.fillText(`${ORGAN_LABELS[sel]} · ${WORDS[statusOf(sel)]}`, sx, sy - s - 8)
  }

  function drawCallouts() {
    const a = clamp(1 - (pose.zoom - 1.12) / 0.5, 0, 1)
    if (a <= 0.02) return
    const ids = [...ORGAN_ORDER, 'skin']
    const items = ids.map(id => {
      const [x, y] = view.toScreen(ANCHORS[id][0], ANCHORS[id][1])
      return { id, x, y }
    })
    const sorted = [...items].sort((p, q) => p.y - q.y)
    const gap = 24
    sorted.forEach((it, i) => {
      it.ly = i === 0 ? it.y : Math.max(it.y, sorted[i - 1].ly + gap)
    })
    ctx.font = `600 ${Math.round(8 + H / 170)}px ${MONO}`
    ctx.textAlign = 'right'
    ctx.globalCompositeOperation = 'source-over'
    for (const it of items) {
      const col = COLORS[statusOf(it.id)]
      const label = `${ORGAN_NUMBERS[it.id]} ${ORGAN_LABELS[it.id]}`
      const tx = W - 10
      const lx = tx - ctx.measureText(label).width - 12
      ctx.globalAlpha = a * (state.selected ? 0.3 : 1)
      ctx.beginPath()
      ctx.moveTo(it.x, it.y)
      ctx.lineTo(lx - 4, it.ly)
      ctx.strokeStyle = 'rgba(147,160,207,0.6)'
      ctx.lineWidth = 0.8
      ctx.stroke()
      ctx.fillStyle = rgba(col, 1)
      ctx.beginPath()
      ctx.arc(it.x, it.y, 2.6, 0, TAU)
      ctx.arc(lx - 4, it.ly, 3, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(190,202,240,0.95)'
      ctx.fillText(label, tx, it.ly + 3.5)
    }
    ctx.globalAlpha = 1
  }

  // ---- the loop ----
  function frame(nowMs) {
    if (destroyed) return
    raf = requestAnimationFrame(frame)
    if (!visible || W === 0 || !ready) return
    const t = (nowMs - startedAt) / 1000

    // camera: a flight, or the rest pose with a slow drift
    let cam
    if (flight) {
      const r = poseAt(flight, nowMs, W)
      cam = { ...r.pose }
      if (r.done) {
        pose = { ...goal }
        flight = null
      }
    } else {
      cam = { ...goal }
      if (!reduced) {
        cam.roll += Math.sin(t * 0.2) * 0.002
        cam.zoom *= 1 + Math.sin(t * 0.27) * 0.006
        cam.fx += Math.sin(t * 0.31) * (state.selected ? 2 : 5) / cam.zoom
        cam.fy += Math.sin(t * 0.23) * (state.selected ? 2 : 3) / cam.zoom
      }
    }
    if (!reduced) {
      // a hair of handheld shake
      cam.fx += (0.25 * Math.sin(t * 7.3) + 0.15 * Math.sin(t * 13.1)) / cam.zoom
      cam.fy += (0.2 * Math.sin(t * 9.1)) / cam.zoom
      // hover depth: the scene leans a little towards the pointer
      hoverPos.x += (hoverPos.tx - hoverPos.x) * 0.06
      hoverPos.y += (hoverPos.ty - hoverPos.y) * 0.06
      cam.swing += hoverPos.x * 5
      cam.fy += hoverPos.y * 3 / cam.zoom
    }
    if (!drag.down && drag.releasedAt && nowMs - drag.releasedAt > 600) {
      drag.x *= 0.93
      drag.y *= 0.93
    }
    cam.swing += drag.x
    cam.fy -= drag.y / (Math.min(W / IMG.w, H / IMG.h) * cam.zoom)
    pose = cam
    view = makeView(pose, W, H)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    drawPicture(t)
    drawStatusGlows(t)
    drawOutlines(t)
    drawScan(t)
    setScreenTransform()
    ctx.globalCompositeOperation = 'source-over'
    drawFocus(t)
    drawCallouts()
  }

  // ---- pointer ----
  const pointFrom = e => {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function hit(x, y) {
    const [ix, iy] = view.toImage(x, y)
    const organ = hitOrgan(ix, iy)
    if (organ) return organ
    if (mask) {
      const px = Math.round((ix / IMG.w) * mask.width)
      const py = Math.round((iy / IMG.h) * mask.height)
      if (px >= 0 && py >= 0 && px < mask.width && py < mask.height) {
        const d = mask.getContext('2d').getImageData(px, py, 1, 1).data
        if (d[0] + d[1] + d[2] > 110) return 'skin'
      }
    }
    return null
  }
  const onDown = e => {
    drag.down = true
    drag.moved = false
    const p = pointFrom(e)
    drag.px = p.x
    drag.py = p.y
    canvas.setPointerCapture?.(e.pointerId)
  }
  const onMove = e => {
    const p = pointFrom(e)
    if (drag.down) {
      const dx = p.x - drag.px
      const dy = p.y - drag.py
      if (!drag.moved && Math.hypot(dx, dy) < 5) return
      drag.moved = true
      drag.x = clamp(drag.x + dx, -W * 0.25, W * 0.25)
      drag.y = clamp(drag.y + dy, -H * 0.15, H * 0.15)
      drag.px = p.x
      drag.py = p.y
      canvas.style.cursor = 'grabbing'
    } else {
      hover = hit(p.x, p.y)
      hoverPos.tx = (p.x / W - 0.5) * 2
      hoverPos.ty = (p.y / H - 0.5) * 2
      canvas.style.cursor = hover ? 'pointer' : 'grab'
    }
  }
  const onUp = e => {
    const p = pointFrom(e)
    if (drag.down && !drag.moved) {
      const id = hit(p.x, p.y)
      if (id) onSelect(id)
    }
    drag.down = false
    drag.releasedAt = performance.now()
    canvas.style.cursor = 'grab'
  }
  const onLeave = () => {
    hover = null
    hoverPos.tx = 0
    hoverPos.ty = 0
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('pointerleave', onLeave)

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  const io = new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? true
  })
  io.observe(canvas)
  resize()
  raf = requestAnimationFrame(frame)

  return {
    update,
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
    },
  }
}
