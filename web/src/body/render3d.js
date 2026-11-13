// Draws the 3D body on a canvas and runs the camera. No library: our own projection (camera3d.js) and 2D canvas.
// What you see: a see-through hologram made of scan rings and dots, glowing organs that beat and breathe, a scan
// plane sweeping up the body, a floor disc in the skin's status color, floating dust, and a camera that flies to the
// part you pick (an arc with a sideways swing, a pull-back and a tilt), then keeps a slow handheld drift.
import { buildBody, ORGAN_ORDER, ORGANS3D, ORGAN_LABELS, ORGAN_NUMBERS, SKIN_ANCHOR } from './model.js'
import { OVERVIEW, makeView, project, poseFor, startFlight, poseAt } from './camera3d.js'

const COLORS = { green: [61, 220, 132], yellow: [255, 204, 77], red: [255, 93, 93], none: [120, 132, 175] }
const WORDS = { green: 'HEALTHY', yellow: 'WATCH', red: 'ACT NOW', none: 'NO DATA' }
const BODY = [110, 168, 255]
const TAU = Math.PI * 2
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const MONO = "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Menlo, Consolas, monospace"
const LEVELS = 6

// A soft round glow, drawn once per color and stamped wherever an organ is
const sprites = new Map()
function sprite(c) {
  const key = c.join(',')
  if (!sprites.has(key)) {
    const s = document.createElement('canvas')
    s.width = s.height = 128
    const g = s.getContext('2d')
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, rgba(c, 0.95))
    grad.addColorStop(0.35, rgba(c, 0.35))
    grad.addColorStop(1, rgba(c, 0))
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    sprites.set(key, s)
  }
  return sprites.get(key)
}

// An ellipsoid as a few latitude circles and meridians, in unit coordinates (scaled and moved per frame)
function ellipsoidLines(lat = 5, lon = 4, n = 22) {
  const lines = []
  for (let i = 1; i <= lat; i++) {
    const phi = (i / (lat + 1)) * Math.PI
    const ring = []
    for (let k = 0; k < n; k++) {
      const th = (k / n) * TAU
      ring.push([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)])
    }
    lines.push(ring)
  }
  for (let j = 0; j < lon; j++) {
    const th = (j / lon) * Math.PI
    const ring = []
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * TAU
      ring.push([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)])
    }
    lines.push(ring)
  }
  return lines
}
const ELLIPSOID = ellipsoidLines()

// Brain "neurons": scattered points inside the ellipsoid, each joined to its two nearest neighbors
function neurons(count = 30) {
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const pts = []
  while (pts.length < count) {
    const p = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]
    if (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] < 0.85) pts.push(p)
  }
  const edges = []
  pts.forEach((p, i) => {
    pts
      .map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2])
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)
      .forEach(([j]) => edges.push([i, j]))
  })
  return { pts, edges }
}
const NEURONS = neurons()

// Bends the unit ellipsoid into the organ's shape: the heart tapers to a point with a notch on top
function shape(id, p) {
  if (id !== 'heart') return p
  const [x, y, z] = p
  const taper = y < 0 ? 1 + y * 0.6 : 1
  const notch = y > 0 ? 0.34 * y * Math.exp(-Math.pow(x / 0.28, 2)) : 0
  return [x * taper, y - notch, z * (y < 0 ? 1 + y * 0.35 : 1)]
}

const heartbeat = t => {
  // a double pulse every ~0.85 s (about 70 bpm)
  const p = (t % 0.85) / 0.85
  return Math.exp(-Math.pow((p - 0.08) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((p - 0.28) / 0.07, 2))
}

export function createBodyRenderer(canvas, { onSelect }) {
  const ctx = canvas.getContext('2d')
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const out = { x: 0, y: 0, z: 0, k: 1 }

  let W = 0
  let H = 0
  let dpr = 1
  let body = null
  let SX = null
  let SY = null
  let SZ = null
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
  let startedAt = performance.now()

  // Drag to orbit: offsets that ease back to zero after you let go
  const drag = { yaw: 0, pitch: 0, down: false, moved: false, x: 0, y: 0, releasedAt: 0 }
  let hover = null
  let screenOrgans = []
  let hitDirty = true

  const dust = Array.from({ length: 90 }, (_, i) => {
    const a = (i * 2.399963) % TAU
    return { x: Math.cos(a) * (30 + ((i * 37) % 55)), y: (i * 53) % 200, z: Math.sin(a) * (30 + ((i * 29) % 55)), v: 3 + ((i * 17) % 7), ph: i }
  })

  function resize() {
    const r = canvas.getBoundingClientRect()
    W = Math.max(1, Math.round(r.width))
    H = Math.max(1, Math.round(r.height))
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    body = buildBody(W < 420 ? 0.7 : 1)
    const n = body.V.length / 3
    SX = new Float32Array(n)
    SY = new Float32Array(n)
    SZ = new Float32Array(n)
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
      goal = next.selected && ORGANS3D[next.selected] ? poseFor(next.selected, side) : { ...OVERVIEW }
      if (reduced) {
        pose = { ...goal }
        flight = null
      } else {
        flight = startFlight({ ...pose, roll: 0 }, goal, performance.now(), side)
      }
    }
  }

  // ---- drawing helpers ----
  const depthAlpha = z => {
    const base = clamp(0.58 - (z - pose.dist) / 64, 0.1, 1)
    const close = clamp((OVERVIEW.dist - pose.dist) / 150, 0, 1)
    if (close <= 0) return base
    // in front of the organ: fade out; everywhere: a little dimmer so the organ is the star
    const front = clamp((z - (pose.dist - 14)) / 14, 0.1, 1)
    return base * (1 - close * (1 - front)) * (1 - 0.35 * close)
  }

  function strokeBuckets(paths, color, width, mult) {
    ctx.lineWidth = width
    for (let b = 0; b < LEVELS; b++) {
      ctx.strokeStyle = rgba(color, ((b + 1) / LEVELS) * mult)
      ctx.stroke(paths[b])
    }
  }
  const newPaths = () => Array.from({ length: LEVELS }, () => new Path2D())
  const bucket = a => Math.min(LEVELS - 1, Math.floor(a * LEVELS))

  function drawBody(view, t) {
    const V = body.V
    const n = V.length / 3
    for (let i = 0; i < n; i++) {
      project(view, V[i * 3], V[i * 3 + 1], V[i * 3 + 2], out)
      SX[i] = out.x
      SY[i] = out.y
      SZ[i] = out.z
    }
    const lines = newPaths()
    const dots = newPaths()
    const hot = new Path2D()
    const scanY = reduced ? -100 : ((t * 0.2) % 1.15) * 195 - 8
    for (const ring of body.rings) {
      const { start, count } = ring
      const isHot = Math.abs(ring.y - scanY) < 2.4
      for (let k = 0; k < count; k++) {
        const i = start + k
        const j = start + ((k + 1) % count)
        if (SZ[i] < 4 || SZ[j] < 4) continue
        const a = depthAlpha((SZ[i] + SZ[j]) / 2)
        const p = lines[bucket(a)]
        p.moveTo(SX[i], SY[i])
        p.lineTo(SX[j], SY[j])
        if (isHot) {
          hot.moveTo(SX[i], SY[i])
          hot.lineTo(SX[j], SY[j])
        }
        if ((k & 1) === 0) dots[bucket(depthAlpha(SZ[i]))].rect(SX[i] - 0.8, SY[i] - 0.8, 1.6, 1.6)
      }
    }
    ctx.globalCompositeOperation = 'lighter'
    strokeBuckets(lines, BODY, 3.2, 0.12)
    strokeBuckets(lines, BODY, 1, 0.55)
    for (let b = 0; b < LEVELS; b++) {
      ctx.fillStyle = `rgba(190,222,255,${((b + 1) / LEVELS) * 0.75})`
      ctx.fill(dots[b])
    }
    if (!reduced) {
      ctx.strokeStyle = 'rgba(160,230,255,0.12)'
      ctx.lineWidth = 4
      ctx.stroke(hot)
      ctx.strokeStyle = 'rgba(220,250,255,0.55)'
      ctx.lineWidth = 1.2
      ctx.stroke(hot)
    }
  }

  function drawFloor(view, t) {
    const c = COLORS[statusOf('skin')]
    for (const [r, a, w] of [[44, 0.5, 1.4], [58, 0.3, 1], [72, 0.18, 1]]) {
      ctx.beginPath()
      for (let k = 0; k <= 72; k++) {
        project(view, Math.cos((k / 72) * TAU) * r, 0, Math.sin((k / 72) * TAU) * r, out)
        if (out.z < 4) continue
        k === 0 ? ctx.moveTo(out.x, out.y) : ctx.lineTo(out.x, out.y)
      }
      ctx.strokeStyle = rgba(c, a)
      ctx.lineWidth = w
      ctx.stroke()
    }
    // ticks turning slowly around the disc
    ctx.beginPath()
    const spin = reduced ? 0 : t * 0.35
    for (let k = 0; k < 48; k++) {
      const th = spin + (k / 48) * TAU
      const long = k % 4 === 0
      for (const r of long ? [58, 66] : [58, 61]) {
        project(view, Math.cos(th) * r, 0, Math.sin(th) * r, out)
        r === (long ? 58 : 58) ? ctx.moveTo(out.x, out.y) : ctx.lineTo(out.x, out.y)
      }
    }
    ctx.strokeStyle = rgba(c, 0.45)
    ctx.lineWidth = 1
    ctx.stroke()
  }

  function drawDust(view, t, dt) {
    ctx.fillStyle = 'rgba(170,210,255,0.8)'
    for (const d of dust) {
      if (!reduced) d.y = (d.y + d.v * dt) % 200
      project(view, d.x, d.y, d.z, out)
      if (out.z < 4) continue
      const a = depthAlpha(out.z) * (0.35 + 0.35 * Math.sin(t * 1.7 + d.ph))
      ctx.globalAlpha = clamp(a, 0, 0.7)
      const s = clamp(out.k * 0.35, 0.8, 2.4)
      ctx.fillRect(out.x - s / 2, out.y - s / 2, s, s)
    }
    ctx.globalAlpha = 1
  }

  function drawOrgans(view, t) {
    const sel = state.selected
    screenOrgans = []
    for (const id of ORGAN_ORDER) {
      const col = COLORS[statusOf(id)]
      const isSel = sel === id
      const emphasis = (isSel ? 1 : sel ? 0.18 : 0.62) + (hover === id ? 0.25 : 0)
      const flash = pulseAt[id] !== undefined ? Math.max(0, 1 - (t - pulseAt[id]) / 1.1) : 0
      let beat = 0
      if (!reduced) {
        if (id === 'heart') beat = heartbeat(t)
        else if (id === 'lungs') beat = 0.5 + 0.5 * Math.sin((t * TAU) / 4.2)
        else if (id === 'brain') beat = 0.5 + 0.5 * Math.sin(t * 1.3)
        else beat = 0.5 + 0.5 * Math.sin((t * TAU) / 6)
      }
      const grow = id === 'heart' ? 0.12 : id === 'lungs' ? 0.06 : 0.03
      for (const o of ORGANS3D[id]) {
        const sc = 1 + grow * beat + flash * 0.12
        const [rx, ry, rz] = o.r.map(v => v * sc)
        // glow sprite
        project(view, o.c[0], o.c[1], o.c[2], out)
        if (out.z < 4) continue
        const R = Math.max(...o.r) * out.k
        const cx = out.x
        const cy = out.y
        ctx.globalCompositeOperation = 'lighter'
        const quiet = sel && !isSel ? 0.3 : 1 // the other organs step back while one is picked
        ctx.globalAlpha = clamp((0.16 + 0.4 * emphasis) * (0.75 + 0.35 * beat + flash) * quiet, 0, 1)
        const gs = R * 2.8
        ctx.drawImage(sprite(col), cx - gs, cy - gs, gs * 2, gs * 2)
        if (isSel) {
          // a bright core so the picked organ reads as a lit object, not just wires
          ctx.globalAlpha = clamp(0.38 + 0.3 * beat + flash * 0.4, 0, 0.9)
          ctx.drawImage(sprite(col), cx - R * 1.25, cy - R * 1.25, R * 2.5, R * 2.5)
        }
        ctx.globalAlpha = 1
        // wireframe
        const paths = [new Path2D(), new Path2D()]
        for (const ring of ELLIPSOID) {
          let first = true
          for (const p of ring) {
            const q = shape(id, p)
            project(view, o.c[0] + q[0] * rx, o.c[1] + q[1] * ry, o.c[2] + q[2] * rz, out)
            const path = paths[out.z > pose.dist ? 1 : 0]
            if (first) path.moveTo(out.x, out.y)
            else path.lineTo(out.x, out.y)
            first = false
          }
          const q0 = shape(id, ring[0])
          project(view, o.c[0] + q0[0] * rx, o.c[1] + q0[1] * ry, o.c[2] + q0[2] * rz, out)
          paths[0].lineTo(out.x, out.y)
        }
        ctx.strokeStyle = rgba(col, 0.1 + 0.35 * emphasis)
        ctx.lineWidth = 3
        ctx.stroke(paths[0])
        ctx.strokeStyle = rgba(col, 0.2 + 0.5 * emphasis)
        ctx.lineWidth = isSel ? 1.1 : 0.9
        ctx.stroke(paths[0])
        ctx.stroke(paths[1])
        if (id === 'brain') drawNeurons(view, o, rx, ry, rz, col, emphasis, t)
        if (id !== 'lungs' || o.c[0] > 0) screenOrgans.push({ id, sx: cx, sy: cy, R, z: out.z })
        else screenOrgans.push({ id, sx: cx, sy: cy, R, z: out.z })
      }
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  function drawNeurons(view, o, rx, ry, rz, col, emphasis, t) {
    const P = NEURONS.pts.map(p => {
      project(view, o.c[0] + p[0] * rx, o.c[1] + p[1] * ry, o.c[2] + p[2] * rz, out)
      return [out.x, out.y]
    })
    ctx.beginPath()
    for (const [i, j] of NEURONS.edges) {
      ctx.moveTo(P[i][0], P[i][1])
      ctx.lineTo(P[j][0], P[j][1])
    }
    ctx.strokeStyle = rgba(col, 0.15 + 0.4 * emphasis)
    ctx.lineWidth = 0.8
    ctx.stroke()
    P.forEach((p, i) => {
      const tw = reduced ? 0.7 : 0.5 + 0.5 * Math.sin(t * 3.1 + i * 1.7)
      ctx.fillStyle = rgba([255, 255, 255], (0.25 + 0.7 * tw) * (0.3 + 0.7 * emphasis))
      const s = 1 + 1.6 * tw
      ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s)
    })
  }

  function drawScanPlane(view, t) {
    if (reduced) return
    const y = ((t * 0.2) % 1.15) * 195 - 8
    ctx.beginPath()
    for (let k = 0; k <= 60; k++) {
      project(view, Math.cos((k / 60) * TAU) * 34, y, Math.sin((k / 60) * TAU) * 22, out)
      if (out.z < 4) continue
      k === 0 ? ctx.moveTo(out.x, out.y) : ctx.lineTo(out.x, out.y)
    }
    ctx.strokeStyle = 'rgba(190,240,255,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // The HUD on the picked part: corner brackets, rings that spread out, and its name
  function drawFocus(t) {
    const sel = state.selected
    const o = screenOrgans.find(s => s.id === sel)
    if (!o) return
    const col = COLORS[statusOf(sel)]
    const zoom = clamp((OVERVIEW.dist - pose.dist) / 150, 0, 1)
    ctx.globalCompositeOperation = 'lighter'
    for (const ph of [0, 0.5]) {
      const p = reduced ? 0.3 : (t * 0.7 + ph) % 1
      ctx.beginPath()
      ctx.arc(o.sx, o.sy, Math.min(o.R, Math.min(W, H) * 0.3) * (1.25 + 0.9 * p), 0, TAU)
      ctx.strokeStyle = rgba(col, (1 - p) * 0.55 * zoom)
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    const s = Math.min(o.R * 1.55, Math.min(W, H) * 0.4)
    const g = s * 0.35
    ctx.strokeStyle = rgba(col, 0.9 * zoom)
    ctx.lineWidth = 1.6
    ctx.beginPath()
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.moveTo(o.sx + sx * s, o.sy + sy * (s - g))
      ctx.lineTo(o.sx + sx * s, o.sy + sy * s)
      ctx.lineTo(o.sx + sx * (s - g), o.sy + sy * s)
    }
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    ctx.font = `700 ${Math.round(11 + H / 120)}px ${MONO}`
    ctx.textAlign = 'center'
    ctx.fillStyle = rgba(col, zoom)
    ctx.fillText(`${ORGAN_LABELS[sel]} · ${WORDS[statusOf(sel)]}`, o.sx, o.sy - s - 8)
  }

  // Numbered labels on the right, joined to each part by a thin line; they fade out as the camera closes in
  function drawCallouts(view) {
    const a = clamp(1 - (OVERVIEW.dist - pose.dist) / 70, 0, 1)
    if (a <= 0.02) return
    const items = screenOrgans
      .filter((s, i, all) => all.findIndex(q => q.id === s.id) === i)
      .map(s => ({ id: s.id, x: s.sx, y: s.sy }))
    project(view, SKIN_ANCHOR[0], SKIN_ANCHOR[1], SKIN_ANCHOR[2], out)
    items.push({ id: 'skin', x: out.x, y: out.y })
    // spread the labels so they never sit on top of each other
    const sorted = [...items].sort((p, q) => p.y - q.y)
    const gap = 24
    sorted.forEach((it, i) => {
      it.ly = i === 0 ? it.y : Math.max(it.y, sorted[i - 1].ly + gap)
    })
    ctx.font = `600 ${Math.round(9 + H / 150)}px ${MONO}`
    ctx.textAlign = 'right'
    for (const it of items) {
      const col = COLORS[statusOf(it.id)]
      const label = `${ORGAN_NUMBERS[it.id]} ${ORGAN_LABELS[it.id]}`
      const tx = W - 10
      const lx = tx - ctx.measureText(label).width - 12
      ctx.globalAlpha = a * (state.selected ? 0.3 : 1)
      ctx.beginPath()
      ctx.moveTo(it.x, it.y)
      ctx.lineTo(lx - 4, it.ly)
      ctx.strokeStyle = 'rgba(147,160,207,0.55)'
      ctx.lineWidth = 0.8
      ctx.stroke()
      ctx.fillStyle = rgba(col, 1)
      ctx.beginPath()
      ctx.arc(lx - 4, it.ly, 3, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(190,202,240,0.95)'
      ctx.fillText(label, tx, it.ly + 3.5)
    }
    ctx.globalAlpha = 1
  }

  // ---- the loop ----
  let lastT = 0
  function frame(nowMs) {
    if (destroyed) return
    raf = requestAnimationFrame(frame)
    if (!visible || W === 0) return
    const t = (nowMs - startedAt) / 1000
    const dt = Math.min(0.05, Math.max(0, t - lastT))
    lastT = t

    // camera: flight, or rest pose with a slow drift
    let cam
    if (flight) {
      const r = poseAt(flight, nowMs)
      cam = { ...r.pose }
      if (r.done) {
        pose = { ...goal }
        flight = null
      }
    } else {
      cam = { ...goal }
    }
    if (!flight) {
      if (!reduced) {
        const overview = !state.selected
        cam.yaw += Math.sin(t * 0.23) * (overview ? 0.42 : 0.09)
        cam.pitch += Math.sin(t * 0.17) * (overview ? 0.025 : 0.02)
        cam.dist += Math.sin(t * 0.31) * (overview ? 3 : 1.6)
      }
    }
    if (!reduced) {
      // a hair of handheld shake
      cam.yaw += 0.0035 * Math.sin(t * 7.3) + 0.002 * Math.sin(t * 13.1)
      cam.pitch += 0.003 * Math.sin(t * 9.1)
    }
    if (!drag.down && drag.releasedAt && nowMs - drag.releasedAt > 700) {
      const k = Math.exp(-dt * 2.2)
      drag.yaw *= k
      drag.pitch *= k
    }
    cam.yaw += drag.yaw
    cam.pitch = clamp(cam.pitch + drag.pitch, -0.6, 0.9)
    if (!flight) pose = cam
    else pose = cam
    const view = makeView(pose, W, H)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'
    drawFloor(view, t)
    drawDust(view, t, dt)
    drawBody(view, t)
    drawScanPlane(view, t)
    drawOrgans(view, t)
    drawFocus(t)
    ctx.globalCompositeOperation = 'source-over'
    drawCallouts(view)
    hitDirty = false
  }

  // ---- pointer ----
  function pointFrom(e) {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function hit(x, y) {
    let best = null
    let bestD = 1.15
    for (const s of screenOrgans) {
      const d = Math.hypot(x - s.sx, y - s.sy) / Math.max(s.R, 8)
      if (d < bestD) {
        bestD = d
        best = s.id
      }
    }
    if (best) return best
    if (SX) {
      for (let i = 0; i < SX.length; i += 3) {
        if (SZ[i] > 4 && Math.hypot(x - SX[i], y - SY[i]) < 14) return 'skin'
      }
    }
    return null
  }
  const onDown = e => {
    drag.down = true
    drag.moved = false
    const p = pointFrom(e)
    drag.x = p.x
    drag.y = p.y
    canvas.setPointerCapture?.(e.pointerId)
  }
  const onMove = e => {
    const p = pointFrom(e)
    if (drag.down) {
      const dx = p.x - drag.x
      const dy = p.y - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 5) return
      drag.moved = true
      drag.yaw += dx * 0.006
      drag.pitch = clamp(drag.pitch + dy * 0.004, -0.5, 0.5)
      drag.x = p.x
      drag.y = p.y
      canvas.style.cursor = 'grabbing'
    } else {
      hover = hit(p.x, p.y)
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
  startedAt = performance.now()
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
