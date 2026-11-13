// A procedural 3D human, built from slices like a medical scan: stacked horizontal rings for the head, neck
// and torso, and rings around an axis for the arms and legs. Units are centimeters, y is up, the body faces +z.
// No models to download and nothing to install: a few tables of measurements and some trigonometry.

const TAU = Math.PI * 2
const lerp = (a, b, t) => a + (b - a) * t
// Catmull-Rom between p1 and p2
const cr = (p0, p1, p2, p3, t) =>
  0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)

// Torso cross-sections, feet to head: [y, half width (x), half depth (z), forward offset (z)]
export const TORSO = [
  [80, 16, 9.5, -0.3],
  [84, 17.2, 10.5, -0.6],
  [92, 17.5, 10.8, -0.6],
  [100, 15.8, 10, 0],
  [108, 14.5, 9.5, 0.6],
  [114, 15.2, 10, 0.8],
  [122, 17, 11.5, 1.2],
  [130, 18, 11.5, 1.2],
  [138, 19.5, 10, 0.8],
  [143, 22, 8.5, 0],
  [146, 14, 7.5, 0],
  [148, 7.5, 6.5, 0],
]

export function torsoAt(y) {
  const last = TORSO.length - 1
  let i = 0
  while (i < last - 1 && y > TORSO[i + 1][0]) i++
  const p1 = TORSO[i]
  const p2 = TORSO[i + 1]
  const p0 = TORSO[Math.max(i - 1, 0)]
  const p3 = TORSO[Math.min(i + 2, last)]
  const t = Math.min(1, Math.max(0, (y - p1[0]) / (p2[0] - p1[0])))
  return [1, 2, 3].map(k => cr(p0[k], p1[k], p2[k], p3[k], t))
}

// Limbs: chains of [x, y, z, radius, flatness] for the left side (x > 0); the right side mirrors it.
const ARM = [
  [22, 141, 0, 6.8, 1],
  [27, 133, 0.2, 6, 1],
  [31, 123, 0, 5, 1],
  [34, 113, 0, 4.2, 1],
  [37, 102, 0.4, 4.5, 1],
  [41, 95, 0.2, 3.6, 1],
  [44, 89, 0, 2.9, 1],
  [46.5, 83, 0, 3.5, 0.55],
  [49, 76, 0, 3.2, 0.45],
  [51.5, 70, 0, 1.9, 0.5],
]
const LEG = [
  [9, 90, -0.6, 9.8, 1],
  [9.2, 78, -0.2, 9.4, 1],
  [9.4, 64, 0.2, 8.4, 1],
  [9.6, 50, 0.6, 6.4, 1],
  [9.4, 44, 0.2, 5.8, 1],
  [9.2, 36, -0.9, 6.3, 1],
  [9, 26, -0.6, 5, 1],
  [8.9, 14, -0.4, 3.9, 1],
  [8.9, 8, 0, 3.5, 1],
  [9, 4.5, 2, 3.4, 0.9],
  [9.3, 3, 9, 2.8, 0.8],
  [9.5, 2.5, 13, 1.6, 0.6],
]

/**
 * Builds the body. density scales how many points each ring has (1 = full, 0.6 for small screens).
 * Returns { V, rings }: V is a flat Float32Array of x,y,z; each ring is { start, count, kind, y } into V.
 */
export function buildBody(density = 1) {
  const pts = []
  const rings = []
  const n = base => Math.max(12, Math.round(base * density))

  const begin = (kind, y, count) => {
    const ring = { start: pts.length / 3, count, kind, y }
    rings.push(ring)
    return ring
  }

  // Flat rings: head, neck and torso
  const horizontal = (kind, y, a, b, cx, cz, count) => {
    begin(kind, y, count)
    for (let k = 0; k < count; k++) {
      const th = (k / count) * TAU
      pts.push(cx + a * Math.cos(th), y, cz + b * Math.sin(th))
    }
  }

  const nTorso = n(40)
  for (let y = 80; y <= 148; y += 2.2) {
    const [a, b, cz] = torsoAt(y)
    horizontal('torso', y, a, b, 0, cz, nTorso)
  }
  for (let y = 147; y <= 158; y += 2.2) horizontal('neck', y, 5.2, 5.2, 0, 0.2, n(18))
  const nHead = n(28)
  for (let y = 156; y <= 180.4; y += 2) {
    const k = (y - 168.4) / 12.3
    const s = Math.sqrt(Math.max(0, 1 - k * k))
    const jaw = y < 164 ? 0.8 + 0.2 * ((y - 156) / 8) : 1
    horizontal('head', y, 8.3 * s * jaw, 10 * s, 0, 1 + (y < 164 ? 1.4 : 0), nHead)
  }

  // Rings around an axis, for arms and legs
  const limb = (nodes, sign) => {
    const count = n(18)
    for (let s = 0; s < nodes.length - 1; s++) {
      const A = nodes[s]
      const B = nodes[s + 1]
      const ax = (B[0] - A[0]) * sign
      const ay = B[1] - A[1]
      const az = B[2] - A[2]
      const len = Math.hypot(ax, ay, az)
      const steps = Math.max(1, Math.round(len / 2.2))
      const last = s === nodes.length - 2
      // axis, and two directions perpendicular to it (u mostly sideways, v mostly front-to-back)
      const dx = ax / len
      const dy = ay / len
      const dz = az / len
      let ux = dy * 1 - dz * 0
      let uy = dz * 0 - dx * 1
      let uz = 0
      const ul = Math.hypot(ux, uy, uz) || 1
      ux /= ul
      uy /= ul
      uz /= ul
      const vx = dy * uz - dz * uy
      const vy = dz * ux - dx * uz
      const vz = dx * uy - dy * ux
      for (let k = 0; k <= steps - (last ? 0 : 1); k++) {
        const t = k / steps
        const cx = lerp(A[0] * sign, B[0] * sign, t)
        const cy = lerp(A[1], B[1], t)
        const cz = lerp(A[2], B[2], t)
        const r = lerp(A[3], B[3], t)
        const flat = lerp(A[4], B[4], t)
        begin('limb', cy, count)
        for (let q = 0; q < count; q++) {
          const th = (q / count) * TAU
          const c = Math.cos(th) * r
          const sn = Math.sin(th) * r * flat
          pts.push(cx + ux * c + vx * sn, cy + uy * c + vy * sn, cz + uz * c + vz * sn)
        }
      }
    }
  }
  for (const sign of [1, -1]) {
    limb(ARM, sign)
    limb(LEG, sign)
  }

  return { V: Float32Array.from(pts), rings }
}

// Organs as ellipsoids: center c and radii r (cm). Lungs are two lobes.
export const ORGAN_ORDER = ['brain', 'lungs', 'heart', 'metabolism']
export const ORGANS3D = {
  brain: [{ c: [0, 168.5, 0.8], r: [6.4, 5.4, 7.4] }],
  lungs: [
    { c: [-8.4, 126, 1.5], r: [6, 13, 6.4] },
    { c: [8.4, 126, 1.5], r: [6, 13, 6.4] },
  ],
  heart: [{ c: [2.4, 121, 4.2], r: [4.4, 5.4, 4.2] }],
  metabolism: [{ c: [-1, 104, 2.2], r: [8.5, 5.6, 5] }],
}
export const ORGAN_LABELS = { brain: 'BRAIN', lungs: 'LUNGS', heart: 'HEART', metabolism: 'METABOLISM', skin: 'SKIN' }
export const ORGAN_NUMBERS = { brain: '01', lungs: '02', heart: '03', metabolism: '04', skin: '05' }
// Where the skin label points: the side of the right hip
export const SKIN_ANCHOR = [-18, 95, 0]
