// A small perspective camera and the "film shot" flights between views. Pure functions, no DOM.
import { ORGANS3D } from './model.js'

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** A pose: where the camera looks (tx,ty,tz), how far away (dist), the angles (yaw, pitch, roll in radians) and the lens (fov, degrees). */
export const OVERVIEW = { yaw: 0, pitch: 0.06, dist: 345, tx: 13, ty: 90, tz: 0, roll: 0, fov: 32 }

// Close views per organ: how near the camera gets
const CLOSE = { brain: 62, lungs: 96, heart: 58, metabolism: 68 }

/** The pose for looking at a part. side (+1/-1) picks which way the camera ends up angled. */
export function poseFor(id, side = 1) {
  const spec = ORGANS3D[id]
  if (!spec) return { ...OVERVIEW, yaw: 0 }
  const sum = spec.reduce((acc, o) => [acc[0] + o.c[0], acc[1] + o.c[1], acc[2] + o.c[2]], [0, 0, 0])
  const m = spec.length
  return { yaw: 0.5 * side, pitch: 0.08, dist: CLOSE[id], tx: sum[0] / m, ty: sum[1] / m, tz: sum[2] / m, roll: 0, fov: 32 }
}

/** The view for one frame: camera position and axes, ready to project points. w and h are the canvas size in px. */
export function makeView(pose, w, h) {
  const cy = Math.cos(pose.yaw)
  const sy = Math.sin(pose.yaw)
  const cp = Math.cos(pose.pitch)
  const sp = Math.sin(pose.pitch)
  const px = pose.tx + pose.dist * sy * cp
  const py = pose.ty + pose.dist * sp
  const pz = pose.tz + pose.dist * cy * cp
  const fx = -sy * cp
  const fy = -sp
  const fz = -cy * cp
  let rx = -fz
  let rz = fx
  const rl = Math.hypot(rx, rz) || 1
  rx /= rl
  rz /= rl
  const ry = 0
  const ux = ry * fz - rz * fy
  const uy = rz * fx - rx * fz
  const uz = rx * fy - ry * fx
  const c = Math.cos(pose.roll)
  const s = Math.sin(pose.roll)
  return {
    px, py, pz, fx, fy, fz,
    rx: rx * c + ux * s, ry: ry * c + uy * s, rz: rz * c + uz * s,
    ux: -rx * s + ux * c, uy: -ry * s + uy * c, uz: -rz * s + uz * c,
    focal: h / 2 / Math.tan((pose.fov * Math.PI) / 360),
    cx: w / 2,
    cy: h / 2,
  }
}

/** Projects a world point. out gets x, y (px), z (depth in front of the camera) and k (px per cm at that depth). */
export function project(v, x, y, z, out) {
  const dx = x - v.px
  const dy = y - v.py
  const dz = z - v.pz
  const zc = dx * v.fx + dy * v.fy + dz * v.fz
  const k = v.focal / Math.max(zc, 1)
  out.x = v.cx + (dx * v.rx + dy * v.ry + dz * v.rz) * k
  out.y = v.cy - (dx * v.ux + dy * v.uy + dz * v.uz) * k
  out.z = zc
  out.k = k
}

/**
 * A flight from one pose to another, like a camera operator's move: it swings sideways along an arc, pulls back
 * a little at the middle, tilts, and settles on the target. side flips the swing direction.
 */
export function startFlight(from, to, now, side, duration = 2600) {
  return { from, to, t0: now, duration, side }
}

export function poseAt(f, now) {
  const p = clamp((now - f.t0) / f.duration, 0, 1)
  const e = easeInOut(p)
  const w = Math.sin(Math.PI * p)
  const lag = easeInOut(clamp(p * 1.15 - 0.08, 0, 1)) // the look-at point trails the body of the move a little
  return {
    pose: {
      yaw: lerp(f.from.yaw, f.to.yaw, e) + f.side * 0.7 * w,
      pitch: lerp(f.from.pitch, f.to.pitch, e) + 0.12 * w,
      dist: lerp(f.from.dist, f.to.dist, e) + 40 * w,
      tx: lerp(f.from.tx, f.to.tx, lag),
      ty: lerp(f.from.ty, f.to.ty, lag),
      tz: lerp(f.from.tz, f.to.tz, lag),
      roll: f.side * 0.07 * w,
      fov: lerp(f.from.fov, f.to.fov, e),
    },
    done: p >= 1,
  }
}
