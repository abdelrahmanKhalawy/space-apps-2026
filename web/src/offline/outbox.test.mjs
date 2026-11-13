// Run: node web/src/offline/outbox.test.mjs
import { flushOutbox, pendingCount, queueReadings } from './outbox.js'

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
  if (!ok) failed++
}
const memory = () => {
  const m = new Map()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
}
const r = n => ({ crewId: 'crew-1', metric: 'sleep_hours', value: n, unit: 'h', takenAt: '2026-11-14T07:00:00Z', source: 'manual' })
const res = status => ({ ok: status < 300, status })

{
  const s = memory()
  check('empty outbox has 0 pending', pendingCount(s) === 0)
  queueReadings([r(6), r(7)], s)
  queueReadings([r(8)], s)
  check('queued readings are counted', pendingCount(s) === 3)

  const offline = async () => { throw new TypeError('network down') }
  const a = await flushOutbox(s, offline)
  check('offline: nothing is lost', a.sent === 0 && a.remaining === 3 && pendingCount(s) === 3)

  const calls = []
  const online = async (url, init) => { calls.push(JSON.parse(init.body).length); return res(201) }
  const b = await flushOutbox(s, online)
  check('online: everything is sent, oldest first', b.sent === 3 && b.remaining === 0 && calls.join() === '2,1', `calls ${calls}`)
}
{
  const s = memory()
  queueReadings([r(1)], s)
  queueReadings([r(2)], s)
  let n = 0
  const mixed = async () => (n++ === 0 ? res(400) : res(201))
  const out = await flushOutbox(s, mixed)
  check('a rejected batch is dropped, the next one still goes', out.dropped === 1 && out.sent === 1 && out.remaining === 0, JSON.stringify(out))
}
{
  const s = memory()
  queueReadings([r(1)], s)
  const out = await flushOutbox(s, async () => res(503))
  check('server error: kept for later', out.remaining === 1 && pendingCount(s) === 1)
}
check('broken storage content is ignored', (() => { const s = { getItem: () => '{not json', setItem() {} }; return pendingCount(s) === 0 })())

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
