// Checks for the 3D body: the model is a believable human size and the camera maths is right.
import assert from 'node:assert/strict'
import { buildBody, torsoAt, ORGANS3D, ORGAN_ORDER } from './model.js'
import { OVERVIEW, makeView, project, poseFor, startFlight, poseAt } from './camera3d.js'

const test = (name, fn) => {
  fn()
  console.log('PASS', name)
}

test('the body is about 1.8 m tall and has a sensible number of points', () => {
  const { V, rings } = buildBody(1)
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 1; i < V.length; i += 3) {
    minY = Math.min(minY, V[i])
    maxY = Math.max(maxY, V[i])
  }
  assert.ok(minY >= 0 && minY < 6, `feet near the floor, got ${minY}`)
  assert.ok(maxY > 178 && maxY < 184, `head top near 180, got ${maxY}`)
  assert.ok(V.length / 3 > 3000 && V.length / 3 < 9000, `points: ${V.length / 3}`)
  assert.ok(rings.every(r => r.start + r.count <= V.length / 3))
})

test('a lower density gives fewer points', () => {
  assert.ok(buildBody(0.6).V.length < buildBody(1).V.length)
})

test('the body is left-right symmetric', () => {
  const { V } = buildBody(1)
  let sum = 0
  for (let i = 0; i < V.length; i += 3) sum += V[i]
  assert.ok(Math.abs(sum / (V.length / 3)) < 1.5, 'mean x is close to 0')
})

test('torso width is widest at the shoulders and narrowest at the waist', () => {
  assert.ok(torsoAt(143)[0] > torsoAt(108)[0])
  assert.ok(torsoAt(92)[0] > torsoAt(108)[0])
})

test('every organ sits inside the body', () => {
  for (const id of ORGAN_ORDER) {
    for (const o of ORGANS3D[id]) {
      const [a, b, cz] = torsoAt(Math.min(Math.max(o.c[1], 80), 148))
      if (id !== 'brain') assert.ok(Math.abs(o.c[0]) + o.r[0] < a + 1, `${id} fits the width`)
      if (id !== 'brain') assert.ok(Math.abs(o.c[2] - cz) + o.r[2] < b + 1, `${id} fits the depth`)
    }
  }
})

test('the camera looks at its target: the target projects to the center', () => {
  const out = {}
  const view = makeView(OVERVIEW, 400, 500)
  project(view, OVERVIEW.tx, OVERVIEW.ty, OVERVIEW.tz, out)
  assert.ok(Math.abs(out.x - 200) < 1e-6 && Math.abs(out.y - 250) < 1e-6)
  assert.ok(Math.abs(out.z - OVERVIEW.dist) < 1e-6)
})

test('up is up and right is right on screen', () => {
  const out = {}
  const view = makeView({ ...OVERVIEW, pitch: 0, yaw: 0 }, 400, 500)
  project(view, 0, OVERVIEW.ty + 20, 0, out)
  assert.ok(out.y < 250, 'higher points are higher on screen (smaller y)')
  project(view, 20, OVERVIEW.ty, 0, out)
  assert.ok(out.x > 200, 'points on +x are on the right')
})

test('the whole body fits in the frame at the overview distance', () => {
  const { V } = buildBody(1)
  const out = {}
  const view = makeView(OVERVIEW, 380, 475)
  for (let i = 0; i < V.length; i += 3) {
    project(view, V[i], V[i + 1], V[i + 2], out)
    assert.ok(out.x > 0 && out.x < 380 && out.y > 0 && out.y < 475, 'point inside the frame')
  }
})

test('a flight starts at the old pose, ends at the new one, and bows out sideways in between', () => {
  const to = poseFor('heart', 1)
  const f = startFlight(OVERVIEW, to, 1000, 1, 2000)
  const start = poseAt(f, 1000).pose
  const mid = poseAt(f, 2000).pose
  const end = poseAt(f, 3000)
  assert.ok(Math.abs(start.dist - OVERVIEW.dist) < 1e-9)
  assert.equal(end.done, true)
  assert.ok(Math.abs(end.pose.dist - to.dist) < 1e-9 && Math.abs(end.pose.roll) < 1e-9)
  const straight = (OVERVIEW.yaw + to.yaw) / 2
  assert.ok(mid.yaw > straight + 0.3, 'the arc swings past the straight line')
  assert.ok(Math.abs(mid.roll) > 0.03, 'the shot tilts halfway')
  assert.ok(mid.dist > (OVERVIEW.dist + to.dist) / 2, 'the camera pulls back halfway')
})

test('every organ has a close pose nearer than the overview', () => {
  for (const id of ORGAN_ORDER) assert.ok(poseFor(id).dist < OVERVIEW.dist / 3)
})
