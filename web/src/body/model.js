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
  [84, 17.6, 11.4, -1.2],
  [92, 18, 11.8, -1.3],
  [100, 15.8, 10, 0],
  [108, 14.5, 9.5, 0.6],
  [114, 15.2, 10, 0.8],
  [122, 17.2, 12, 1.6],
  [130, 18.4, 12.4, 1.8],
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
  [23, 141, 0, 7.6, 1],
  [27.5, 133, 0.2, 6.6, 1],
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
  [9.4, 64, 0.2, 9.0, 1],
  [9.6, 50, 0.6, 6.4, 1],
  [9.4, 44, 0.2, 5.8, 1],
  [9.2, 36, -1.1, 7.0, 1],
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
  let chain = 0
  const n = base => Math.max(12, Math.round(base * density))

  const begin = (kind, y, count, c) => {
    const ring = { start: pts.length / 3, count, kind, y, chain, c }
    rings.push(ring)
    return ring
  }

  // Flat rings: head, neck and torso
  const horizontal = (kind, y, a, b, cx, cz, count) => {
    begin(kind, y, count, [cx, y, cz])
    for (let k = 0; k < count; k++) {
      const th = (k / count) * TAU
      pts.push(cx + a * Math.cos(th), y, cz + b * Math.sin(th))
    }
  }

  const nTorso = n(36)
  chain++
  for (let y = 80; y <= 148; y += 2.2) {
    const [a, b, cz] = torsoAt(y)
    horizontal('torso', y, a, b, 0, cz, nTorso)
  }
  for (let y = 147; y <= 158; y += 2.2) horizontal('neck', y, 5.2, 5.2, 0, 0.2, nTorso)
  const nHead = nTorso
  for (let y = 156; y <= 180.4; y += 2) {
    const k = (y - 168.4) / 12.3
    const s = Math.sqrt(Math.max(0, 1 - k * k))
    const jaw = y < 164 ? 0.8 + 0.2 * ((y - 156) / 8) : 1
    horizontal('head', y, 8.3 * s * jaw, 10 * s, 0, 1 + (y < 164 ? 1.4 : 0), nHead)
  }

  // Rings around an axis, for arms and legs
  const limb = (nodes, sign) => {
    const count = n(18)
    chain++
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
        begin('limb', cy, count, [cx, cy, cz])
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

  const V = Float32Array.from(pts)

  // Outward normals (used for the rim glow) and the lines that run down the body from ring to ring
  const N = new Float32Array(V.length)
  for (const r of rings) {
    for (let k = 0; k < r.count; k++) {
      const i = (r.start + k) * 3
      const dx = V[i] - r.c[0]
      const dy = V[i + 1] - r.c[1]
      const dz = V[i + 2] - r.c[2]
      const l = Math.hypot(dx, dy, dz) || 1
      N[i] = dx / l
      N[i + 1] = dy / l
      N[i + 2] = dz / l
    }
  }
  const links = []
  for (let r = 0; r + 1 < rings.length; r++) {
    const a = rings[r]
    const b = rings[r + 1]
    if (a.chain !== b.chain || a.count !== b.count) continue
    const step = Math.max(2, Math.round(a.count / 10))
    for (let k = 0; k < a.count; k += step) links.push(a.start + k, b.start + k)
  }
  // The surface as quads (four vertex indices each) between neighbouring rings
  const quads = []
  for (let r = 0; r + 1 < rings.length; r++) {
    const a = rings[r]
    const b = rings[r + 1]
    if (a.chain !== b.chain || a.count !== b.count) continue
    for (let k = 0; k < a.count; k++) {
      const k2 = (k + 1) % a.count
      quads.push(a.start + k, a.start + k2, b.start + k2, b.start + k)
    }
  }
  return { V, N, rings, links: Uint32Array.from(links), quads: Uint32Array.from(quads) }
}

// Blood vessels: routes from the heart out to the head, arms and legs (left side listed; right mirrors).
// Particles stream along them in time with the heartbeat.
const SPINE = [[2.4, 126, 4], [0, 138, 2], [0, 148, 0], [0, 158, 0.6], [0, 166, 1]]
const ARM_V = [[0, 138, 2], [14, 140, 0], [27, 132, 0.2], [34, 113, 0], [40, 100, 0.3], [44, 89, 0]]
const BELLY = [[2.4, 126, 4], [0, 112, 2], [0, 98, 0], [0, 88, -0.5]]
const LEG_V = [[0, 88, -0.5], [9, 80, -0.2], [9.5, 60, 0.3], [9.6, 48, 0.6], [9.2, 30, -0.8], [8.9, 10, -0.3]]
const mirror = pts => pts.map(p => [-p[0], p[1], p[2]])
export const VESSELS = [SPINE, ARM_V, mirror(ARM_V), BELLY, LEG_V, mirror(LEG_V)]

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

/**
 * The skeleton, drawn faintly inside the body: spine, ribs, collar bones, pelvis, arm and leg bones, a skull outline.
 * Returns { lines, joints }: lines are lists of [x, y, z] points, joints are single points.
 */
export function buildSkeleton() {
  const lines = []
  const joints = []
  const mirror = (pts, sign) => pts.map(p => [p[0] * sign, p[1], p[2]])

  // spine
  const spine = []
  for (let y = 92; y <= 146; y += 3.4) {
    const t = (y - 92) / 54
    const p = [0, y, -3.6 + 1.3 * Math.sin(t * TAU)]
    spine.push(p)
    joints.push(p)
  }
  lines.push(spine)

  // ribs: ellipse arcs from the spine round the side to the breastbone, sloping down towards the front
  const widths = [11.5, 14, 15.6, 16.6, 16.8, 16.2, 15.2, 13.8, 12.2]
  widths.forEach((a, k) => {
    const y0 = 141 - k * 3.7
    const b = a * 0.6
    const arc = []
    for (let q = 0; q <= 14; q++) {
      const phi = Math.PI * (0.06 + 0.86 * (q / 14))
      arc.push([a * Math.sin(phi), y0 - 5.2 * (phi / Math.PI), 0.9 - b * Math.cos(phi)])
    }
    lines.push(mirror(arc, 1), mirror(arc, -1))
  })
  lines.push([[0, 143, 8.6], [0, 124, 9.8]]) // breastbone

  // collar bones
  const collar = [[1.5, 143, 7], [10, 143.5, 5], [22, 141, 1]]
  lines.push(mirror(collar, 1), mirror(collar, -1))

  // pelvis: two arcs that nearly meet at the front
  const hip = []
  for (let q = 0; q <= 12; q++) {
    const phi = Math.PI * (0.1 + 0.8 * (q / 12))
    hip.push([14.5 * Math.sin(phi), 93 - 4 * Math.sin(phi * 1.0), -0.5 - 8.6 * Math.cos(phi)])
  }
  lines.push(mirror(hip, 1), mirror(hip, -1))

  // arms and legs: bones with a joint at each end
  for (const sign of [1, -1]) {
    const arm = mirror([[22, 141, 0], [34, 113, 0], [44, 89, 0], [51, 72, 0]], sign)
    const leg = mirror([[9.5, 88, -0.5], [9.6, 48, 0.6], [9, 10, -0.4], [9.5, 2.5, 12]], sign)
    lines.push(arm, leg)
    joints.push(...arm, ...leg)
  }

  // skull: cranium ring, jaw and the two eye sockets
  const ring = (cx, cy, cz, r, plane, count = 22) =>
    Array.from({ length: count + 1 }, (_, k) => {
      const th = (k / count) * TAU
      return plane === 'h'
        ? [cx + r * Math.cos(th), cy, cz + r * 1.15 * Math.sin(th)]
        : [cx + r * Math.cos(th), cy + r * Math.sin(th), cz]
    })
  lines.push(ring(0, 172, 1, 8.4, 'h'), ring(0, 166, 1, 7.6, 'h'))
  lines.push([[-8, 168, 2], [-7, 162, 5], [-3.5, 158, 9], [0, 157, 10], [3.5, 158, 9], [7, 162, 5], [8, 168, 2]])
  lines.push(ring(-3.4, 169, 9.6, 1.7, 'v', 10), ring(3.4, 169, 9.6, 1.7, 'v', 10))
  return { lines, joints }
}
