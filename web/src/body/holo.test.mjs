// Checks for the hologram camera: the maths maps points both ways, flights start and end where they should,
// and organs are where the picture shows them.
import assert from 'node:assert/strict'
import { IMG, OVERVIEW, ORGAN_ORDER, ORGAN_SPOTS, ORGAN_SHAPES, ANCHORS, makeView, poseFor, startFlight, poseAt, hitOrgan } from './holo.js'

const test = (name, fn) => {
  fn()
  console.log('PASS', name)
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

test('the focus point of a pose is the center of the frame', () => {
  const v = makeView(OVERVIEW, 400, 534)
  const [x, y] = v.toScreen(OVERVIEW.fx, OVERVIEW.fy)
  assert.ok(near(x, 200) && near(y, 267))
})

test('toImage undoes toScreen, also when tilted and swung', () => {
  const v = makeView({ fx: 462, fy: 331, zoom: 3.1, roll: 0.07, swing: 40 }, 330, 442)
  for (const [x, y] of [[100, 100], [450, 600], [800, 1100]]) {
    const [sx, sy] = v.toScreen(x, y)
    const [bx, by] = v.toImage(sx, sy)
    assert.ok(near(bx, x, 1e-6) && near(by, y, 1e-6))
  }
})

test('the canvas matrix agrees with toScreen', () => {
  const v = makeView({ fx: 300, fy: 400, zoom: 2, roll: 0.1, swing: 12 }, 400, 534)
  const [a, b, c, d, e, f] = v.matrix
  const [sx, sy] = v.toScreen(123, 456)
  assert.ok(near(a * 123 + c * 456 + e, sx, 1e-6) && near(b * 123 + d * 456 + f, sy, 1e-6))
})

test('the whole picture fits at zoom 1 whatever the frame shape', () => {
  for (const [w, h] of [[330, 442], [440, 590], [300, 600]]) {
    const v = makeView({ ...OVERVIEW, zoom: 1, fx: IMG.w / 2, fy: IMG.h / 2 }, w, h)
    const [x0, y0] = v.toScreen(0, 0)
    const [x1, y1] = v.toScreen(IMG.w, IMG.h)
    assert.ok(x0 >= -0.5 && y0 >= -0.5 && x1 <= w + 0.5 && y1 <= h + 0.5)
  }
})

test('every organ is inside the picture and hits itself', () => {
  for (const id of ORGAN_ORDER) {
    const o = ORGAN_SPOTS[id]
    assert.ok(o.c[0] - o.r[0] > 0 && o.c[0] + o.r[0] < IMG.w && o.c[1] - o.r[1] > 0 && o.c[1] + o.r[1] < IMG.h)
    assert.equal(hitOrgan(o.c[0], o.c[1]) === id || id === 'lungs', true, `${id} is hit at its center`)
  }
  assert.equal(hitOrgan(450, 120), 'brain')
  assert.equal(hitOrgan(462, 331), 'heart')
  assert.equal(hitOrgan(50, 50), null)
})

test('every callout anchor is on the picture', () => {
  for (const [id, [x, y]] of Object.entries(ANCHORS)) assert.ok(x > 0 && x < IMG.w && y > 0 && y < IMG.h, id)
})

test('looking at a part zooms in on it', () => {
  for (const id of ORGAN_ORDER) {
    const p = poseFor(id)
    assert.ok(p.zoom > 1.8 * OVERVIEW.zoom)
    assert.ok(near(p.fx, ORGAN_SPOTS[id].c[0]) && near(p.fy, ORGAN_SPOTS[id].c[1]))
  }
})

test('a flight starts at the old pose, ends at the new one, and bows out sideways in between', () => {
  const to = poseFor('heart')
  const f = startFlight(OVERVIEW, to, 1000, 1, 2000)
  const start = poseAt(f, 1000, 400)
  const mid = poseAt(f, 2000, 400)
  const end = poseAt(f, 3000, 400)
  assert.ok(near(start.pose.zoom, OVERVIEW.zoom, 1e-9))
  assert.equal(end.done, true)
  assert.ok(near(end.pose.zoom, to.zoom, 1e-9) && near(end.pose.swing, 0) && near(end.pose.roll, 0))
  assert.ok(Math.abs(mid.pose.swing) > 8 && Math.abs(mid.pose.swing) < 40, 'the shot drifts a little to the side halfway')
  assert.ok(Math.abs(mid.pose.roll) > 0.005 && Math.abs(mid.pose.roll) < 0.03, 'the tilt is slight')
  assert.ok(mid.pose.zoom < Math.sqrt(OVERVIEW.zoom * to.zoom), 'the camera eases back halfway')
})

test('the swing flips with the side', () => {
  const to = poseFor('brain')
  const a = poseAt(startFlight(OVERVIEW, to, 0, 1, 1000), 500, 400).pose
  const b = poseAt(startFlight(OVERVIEW, to, 0, -1, 1000), 500, 400).pose
  assert.ok(a.swing > 0 && b.swing < 0 && near(a.swing, -b.swing))
})

test('every organ outline is inside the picture and clicks land on the right organ', () => {
  for (const id of ORGAN_ORDER) {
    for (const poly of ORGAN_SHAPES[id]) {
      assert.ok(poly.length >= 10, `${id} has enough points`)
      assert.ok(poly.every(([x, y]) => x > 0 && x < IMG.w && y > 0 && y < IMG.h))
    }
  }
  assert.equal(hitOrgan(462, 331), 'heart', 'the heart wins over the lungs behind it')
  assert.equal(hitOrgan(410, 340), 'lungs')
  assert.equal(hitOrgan(495, 340), 'lungs')
  assert.equal(hitOrgan(452, 484), 'metabolism')
})
