// The camera for the hologram picture (hologram.webp, 896 x 1200) and the "film shot" flights between views.
// Everything here is in picture pixels and pure maths, so it can be tested without a browser.

export const IMG = { w: 896, h: 1200 }

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// Where each organ sits in the picture: center c, radii r (px) and how far the camera zooms to look at it.
export const ORGAN_ORDER = ['brain', 'lungs', 'heart', 'metabolism']
export const ORGAN_SPOTS = {
  brain: { c: [451, 120], r: [32, 30], zoom: 3.3 },
  lungs: { c: [450, 316], r: [70, 88], zoom: 2.5 },
  heart: { c: [462, 331], r: [28, 38], zoom: 3.1 },
  metabolism: { c: [450, 484], r: [54, 40], zoom: 2.6 },
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

/** The organ under a picture point (smallest distance relative to its size), or null. */
export function hitOrgan(x, y, pad = 1.15) {
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
 * A flight from one pose to another, like a camera operator's move: the shot swings sideways, pulls back a little
 * halfway, tilts, and settles on the target. side flips the swing direction.
 */
export function startFlight(from, to, now, side, duration = 2400) {
  return { from, to, t0: now, duration, side }
}

export function poseAt(f, now, width = 400) {
  const p = clamp((now - f.t0) / f.duration, 0, 1)
  const e = easeInOut(p)
  const w = Math.sin(Math.PI * p)
  const lag = easeInOut(clamp(p * 1.15 - 0.08, 0, 1)) // the look-at point trails the move a little
  const zoom = Math.exp(lerp(Math.log(f.from.zoom), Math.log(f.to.zoom), e)) * (1 - 0.2 * w)
  return {
    pose: {
      fx: lerp(f.from.fx, f.to.fx, lag),
      fy: lerp(f.from.fy, f.to.fy, lag),
      zoom,
      roll: f.side * 0.07 * w,
      swing: f.side * 0.16 * width * w,
    },
    done: p >= 1,
  }
}
