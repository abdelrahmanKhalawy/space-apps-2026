// Preflight: checks a running AstroPulse (local or the live Azure link) the way a judge would meet it.
//
//   node scripts/preflight.mjs                                  # http://localhost:5080
//   node scripts/preflight.mjs https://space-monkeys-2026.azurewebsites.net
//
// Exit code 1 if anything FAILS. WARN means "look at this" (for example: the demo is not in its clean starting state).
// Needs Node 18+ and no packages. Run it from any network that can reach the site (the phone hotspot, if the team network blocks Azure).

const base = (process.argv[2] ?? 'http://localhost:5080').replace(/\/+$/, '')
const ARABIC = /[؀-ۿ]/
let failed = 0
let warned = 0

const ok = (name, detail = '') => console.log(`  ok    ${name}${detail ? '  ' + detail : ''}`)
const warn = (name, detail = '') => { warned++; console.log(`  WARN  ${name}${detail ? '  ' + detail : ''}`) }
const fail = (name, detail = '') => { failed++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }

async function get(path, { json = false } = {}) {
  const started = Date.now()
  const res = await fetch(base + path, { signal: AbortSignal.timeout(30000) })
  const ms = Date.now() - started
  const body = json ? await res.json().catch(() => null) : await res.text()
  return { res, body, ms }
}

async function step(name, fn) {
  try {
    await fn()
  } catch (e) {
    fail(name, e.name === 'TimeoutError' ? 'timed out after 30 s' : e.message)
  }
}

console.log(`AstroPulse preflight against ${base}\n`)

await step('home page', async () => {
  const { res, body, ms } = await get('/')
  if (res.status !== 200) return fail('home page', `HTTP ${res.status}`)
  if (!body.includes('id="root"')) return fail('home page', 'no React root in the HTML')
  ok('home page', `${ms} ms`)
  if (ms > 5000) warn('home page is slow', `${ms} ms: a cold start? Open it a minute before presenting, or raise the plan and turn on Always on.`)
})

await step('health', async () => {
  const { res, body } = await get('/api/health')
  res.status === 200 && body.trim() === 'ok' ? ok('/api/health') : fail('/api/health', `HTTP ${res.status} ${String(body).slice(0, 40)}`)
})

await step('status and English advice', async () => {
  const { res, body } = await get('/api/status?crewId=crew-1', { json: true })
  if (res.status !== 200 || !body?.metrics) return fail('/api/status', `HTTP ${res.status}`)
  const advice = body.metrics.map(m => m.advice).filter(Boolean)
  if (body.metrics.length < 8) warn('/api/status', `only ${body.metrics.length} of 8 indicators have a reading`)
  if (advice.some(a => ARABIC.test(a))) return fail('/api/status', 'advice is Arabic by default (expected English)')
  ok('/api/status', `${body.metrics.length} indicators, English advice, overall ${body.overall}`)
})

await step('model flags (the Day-143 story)', async () => {
  const { res, body } = await get('/api/explain', { json: true })
  if (res.status !== 200 || !Array.isArray(body)) return fail('/api/explain', `HTTP ${res.status}`)
  const flagged = body.map(e => e.metric)
  if (flagged.includes('heart_rate')) ok('/api/explain', `flags: ${flagged.join(', ')}`)
  else warn('/api/explain', `heart_rate is not flagged (got: ${flagged.join(', ') || 'nothing'}). The demo story needs the clean Day-143 data: run Restore demo data.`)
})

await step('forecast', async () => {
  const { res, body } = await get('/api/forecast', { json: true })
  res.status === 200 && Array.isArray(body) ? ok('/api/forecast', `${body.length} forecast(s)`) : fail('/api/forecast', `HTTP ${res.status}`)
})

await step('space weather', async () => {
  const { res, body } = await get('/api/space-weather', { json: true })
  if (res.status !== 200 || !body?.level) return fail('/api/space-weather', `HTTP ${res.status}`)
  if (body.source === 'live') ok('/api/space-weather', `live NOAA, ${body.level}${body.nasa ? ', NASA DONKI included' : ', no NASA DONKI line'}`)
  else warn('/api/space-weather', `source is "${body.source}", not live: the server cannot reach NOAA (the recorded reading is shown instead)`)
  if (body.source === 'live' && !body.nasa) warn('NASA DONKI', 'no NASA events: set the Nasa__ApiKey app setting to a free api.nasa.gov key (DEMO_KEY is rate limited)')
})

await step('simulated storm preview', async () => {
  const { body } = await get('/api/space-weather?scenario=storm', { json: true })
  body?.simulated === true && body.level === 'storm' ? ok('storm preview is labeled simulated') : fail('storm preview', 'not marked simulated')
})

await step('export and API docs', async () => {
  const csv = await get('/api/export?crewId=crew-1')
  csv.res.status === 200 && csv.body.startsWith('crewId,metric,value,unit,takenAt,source') ? ok('/api/export (CSV)') : fail('/api/export', `HTTP ${csv.res.status}`)
  const doc = await get('/swagger/v1/swagger.json')
  doc.res.status === 200 && doc.body.includes('/api/status') ? ok('/swagger') : fail('/swagger', `HTTP ${doc.res.status}`)
})

await step('installable and offline files', async () => {
  const sw = await get('/sw.js')
  const man = await get('/manifest.webmanifest')
  sw.res.status === 200 && /javascript/.test(sw.res.headers.get('content-type') ?? '') ? ok('/sw.js') : fail('/sw.js', `HTTP ${sw.res.status} ${sw.res.headers.get('content-type')}`)
  man.res.status === 200 ? ok('/manifest.webmanifest') : fail('/manifest.webmanifest', `HTTP ${man.res.status}`)
  if (!base.startsWith('https://') && !/localhost|127\.0\.0\.1/.test(base)) warn('not https', 'the camera and installing the app need https (or localhost)')
})

await step('demo state is clean', async () => {
  const readings = await get('/api/readings?crewId=crew-1', { json: true })
  const reports = await get('/api/reports?crewId=crew-1', { json: true })
  const replies = await get('/api/replies?crewId=crew-1', { json: true })
  if (![readings.res, reports.res, replies.res].every(r => r.status === 200)) return fail('demo state', 'could not read readings/reports/replies')
  const extra = readings.body.filter(r => r.source !== 'mock').length
  const problems = []
  if (extra > 0) problems.push(`${extra} non-sample reading(s)`)
  if (reports.body.length > 0) problems.push(`${reports.body.length} report(s)`)
  if (replies.body.length > 0) problems.push(`${replies.body.length} reply(ies)`)
  problems.length === 0
    ? ok('demo state', 'only the Day-143 sample data, no reports')
    : warn('demo state is not clean', `${problems.join(', ')}. Ground screen (#ground) -> Restore demo data.`)
})

console.log(`\n${failed === 0 ? 'PASSED' : 'FAILED'}: ${failed} failure(s), ${warned} warning(s)`)
process.exitCode = failed === 0 ? 0 : 1 // let open connections close instead of process.exit() (avoids a noisy libuv message on Windows)
