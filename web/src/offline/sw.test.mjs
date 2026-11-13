// Run: node web/src/offline/sw.test.mjs
// Loads web/public/sw.js in a sandbox with fake caches/fetch and checks what it answers online and offline.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
  if (!ok) failed++
}

const code = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')

function makeEnv() {
  const stores = new Map()
  const store = n => stores.get(n) ?? stores.set(n, new Map()).get(n)
  // like the real Cache API: relative paths resolve against the origin and the #fragment is ignored
  const key = r => { const u = new URL(typeof r === 'string' ? r : r.url, 'http://app.test'); u.hash = ''; return u.href }
  const cacheApi = n => ({
    put: async (r, res) => void store(n).set(key(r), res),
    match: async r => store(n).get(key(r)),
    addAll: async urls => urls.forEach(u => store(n).set(new URL(u, 'http://app.test').href, makeRes('shell:' + u))),
  })
  const net = { online: true }
  const makeRes = (body, ok = true) => ({ ok, body, clone() { return this } })
  const listeners = {}
  const env = {
    self: { addEventListener: (t, f) => (listeners[t] = f), skipWaiting: async () => {}, clients: { claim: async () => {} } },
    location: { origin: 'http://app.test' },
    URL,
    Response: { error: () => ({ ok: false, body: 'error' }) },
    caches: {
      open: async n => cacheApi(n),
      keys: async () => [...stores.keys()],
      delete: async n => stores.delete(n),
      match: async r => { for (const s of stores.values()) if (s.has(key(r))) return s.get(key(r)) },
    },
    fetch: async r => { if (!net.online) throw new TypeError('offline'); return makeRes('net:' + key(r)) },
  }
  vm.runInNewContext(code, env)
  const ask = async (url, { method = 'GET', mode = 'cors' } = {}) => {
    let answer
    const event = { request: { url: 'http://app.test' + url, method, mode }, respondWith: p => (answer = p), waitUntil: () => {} }
    listeners.fetch(event)
    return answer === undefined ? 'passthrough' : (await answer).body
  }
  const install = () => new Promise(res => listeners.install({ waitUntil: p => p.then(res) }))
  return { net, ask, install }
}

const e = makeEnv()
await e.install()
check('page online comes from the network', (await e.ask('/', { mode: 'navigate' })) === 'net:http://app.test/')
check('api online comes from the network', (await e.ask('/api/status?crewId=crew-1')) === 'net:http://app.test/api/status?crewId=crew-1')
e.net.online = false
check('page offline: still opens (cached)', (await e.ask('/', { mode: 'navigate' })) === 'net:http://app.test/')
check('deep link offline falls back to the cached shell', (await e.ask('/#crew', { mode: 'navigate' })) === 'net:http://app.test/')
check('api offline: last good answer is served', (await e.ask('/api/status?crewId=crew-1')) === 'net:http://app.test/api/status?crewId=crew-1')
check('api never seen + offline: an error, not a crash', (await e.ask('/api/unknown')) === 'error')
check('POST is never intercepted', (await e.ask('/api/readings', { method: 'POST' })) === 'passthrough')
check('live socket is never intercepted', (await e.ask('/hubs/readings/negotiate')) === 'passthrough')
check('demo controls are never cached', (await e.ask('/api/demo/fast-forward')) === 'passthrough')

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
