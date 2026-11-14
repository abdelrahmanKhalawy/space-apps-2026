// The camera for the hologram picture (hologram.webp, 896 x 1200) and the "film shot" flights between views.
// Everything here is in picture pixels and pure maths, so it can be tested without a browser.

export const IMG = { w: 896, h: 1200 }

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const easeInOut = t => -(Math.cos(Math.PI * t) - 1) / 2 // smooth start and stop, no sharp acceleration

// Where each organ sits in the picture: center c, radii r (px) and how far the camera zooms to look at it.
export const ORGAN_ORDER = ['brain', 'lungs', 'heart', 'metabolism']
export const ORGAN_SPOTS = {
  brain: { c: [451, 120], r: [32, 30], zoom: 2.8 },
  lungs: { c: [450, 316], r: [70, 88], zoom: 2.2 },
  heart: { c: [462, 331], r: [28, 38], zoom: 2.7 },
  metabolism: { c: [450, 484], r: [54, 40], zoom: 2.3 },
}
// The outline of each organ in the picture (traced from its colors): the lungs have two lobes. Used to draw the
// organs clearly apart from each other and to know which one a click lands on.
export const ORGAN_SHAPES = {
  brain: [[[424, 115], [426, 106], [433, 100], [438, 99], [460, 96], [464, 96], [473, 101], [475, 104], [477, 107], [479, 125], [476, 131], [451, 140], [428, 134], [425, 130], [423, 126]]],
  lungs: [[[383, 336], [395, 308], [398, 300], [408, 284], [432, 285], [436, 290], [439, 303], [443, 351], [441, 378], [437, 387], [433, 390], [403, 391], [389, 380], [383, 339]], [[463, 377], [468, 286], [470, 283], [485, 279], [493, 283], [501, 294], [510, 312], [517, 338], [517, 359], [513, 381], [500, 392], [466, 382]]],
  heart: [[[434, 319], [438, 309], [446, 304], [454, 303], [476, 307], [487, 315], [489, 321], [488, 340], [450, 357], [446, 355], [436, 343], [433, 333]]],
  metabolism: [[[395, 492], [397, 471], [399, 469], [473, 448], [489, 448], [492, 449], [502, 477], [502, 478], [494, 507], [488, 517], [479, 519], [421, 517], [404, 512], [400, 506]]],
}
export const ORGAN_LABELS = { brain: 'BRAIN', lungs: 'LUNGS', heart: 'HEART', metabolism: 'METABOLISM', skin: 'SKIN' }
export const ORGAN_NUMBERS = { brain: '01', lungs: '02', heart: '03', metabolism: '04', skin: '05' }
// Where each callout line starts (the edge of the part facing the labels on the right)
export const ANCHORS = { brain: [478, 118], lungs: [518, 300], heart: [488, 331], metabolism: [494, 484], skin: [548, 780] }

/** A pose: the picture point in the middle of the frame, the zoom (1 = whole picture), a tilt, and a sideways swing in px. */
export const OVERVIEW = { fx: 466, fy: 590, zoom: 1.12, roll: 0, swing: 0 }

export function poseFor(id) {
  const o = ORGAN_SPOTS[id]
  return o ? { fx: o.c[0], fy: o.c[1], zoom: o.zoom, roll: 0, swing: 0 } : { ...OVERVIEW }
}

/** Maps picture points to the screen and back for a frame of w x h px. */
export function makeView(pose, w, h) {
  const scale = Math.min(w / IMG.w, h / IMG.h) * pose.zoom
  const c = Math.cos(pose.roll)
  const s = Math.sin(pose.roll)
  const ox = w / 2 + pose.swing
  const oy = h / 2
  return {
    scale,
    // the canvas matrix a, b, c, d, e, f
    matrix: [scale * c, scale * s, -scale * s, scale * c, ox - scale * (c * pose.fx - s * pose.fy), oy - scale * (s * pose.fx + c * pose.fy)],
    toScreen(x, y) {
      const dx = (x - pose.fx) * scale
      const dy = (y - pose.fy) * scale
      return [ox + dx * c - dy * s, oy + dx * s + dy * c]
    },
    toImage(sx, sy) {
      const dx = sx - ox
      const dy = sy - oy
      return [pose.fx + (dx * c + dy * s) / scale, pose.fy + (-dx * s + dy * c) / scale]
    },
  }
}

function inside(poly, x, y) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

// Smaller or in-front organs first, so a click on the heart is not taken by the lungs behind it
const HIT_ORDER = ['heart', 'brain', 'metabolism', 'lungs']

/** The organ under a picture point, or null. */
export function hitOrgan(x, y, pad = 1.1) {
  for (const id of HIT_ORDER) if (ORGAN_SHAPES[id].some(p => inside(p, x, y))) return id
  let best = null
  let bestD = pad
  for (const id of ORGAN_ORDER) {
    const o = ORGAN_SPOTS[id]
    const d = Math.hypot((x - o.c[0]) / o.r[0], (y - o.c[1]) / o.r[1])
    if (d < bestD) {
      bestD = d
      best = id
    }
  }
  return best
}

/**
 * A flight from one pose to another, a gentle camera move: the shot drifts a little to one side, eases back
 * slightly halfway, tilts a hair, and settles on the target. side flips the swing direction.
 */
export function startFlight(from, to, now, side, duration = 1800) {
  return { from, to, t0: now, duration, side }
}

export function poseAt(f, now, width = 400) {
  const p = clamp((now - f.t0) / f.duration, 0, 1)
  const e = easeInOut(p)
  const w = Math.sin(Math.PI * p)
  const lag = easeInOut(clamp(p * 1.15 - 0.08, 0, 1)) // the look-at point trails the move a little
  const zoom = Math.exp(lerp(Math.log(f.from.zoom), Math.log(f.to.zoom), e)) * (1 - 0.05 * w)
  return {
    pose: {
      fx: lerp(f.from.fx, f.to.fx, lag),
      fy: lerp(f.from.fy, f.to.fy, lag),
      zoom,
      roll: f.side * 0.015 * w,
      swing: f.side * 0.035 * width * w,
    },
    done: p >= 1,
  }
}
