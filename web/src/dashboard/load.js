import thresholds from './thresholds.js'
import { localStatus } from './status.js'
import { langQuery } from '../i18n/lang.js'

const CREW_ID = 'crew-1'

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res.json()
}

/** Just the current status (what the live body polls). Returns null if the server cannot be reached. */
export async function fetchStatus() {
  try {
    return await getJson(`/api/status?crewId=${CREW_ID}${langQuery()}`)
  } catch {
    return null
  }
}

/** Loads a {metric: value} map from a live endpoint, or its precomputed-file fallback
 * at the same relative path, or {} if neither is reachable. Used for i3 and i4, which
 * both ship this way: a small server endpoint backed by a data/precomputed/*.json file. */
async function fetchByMetric(apiPath, fallbackImport) {
  try {
    const list = await getJson(apiPath)
    return Object.fromEntries(list.map(e => [e.metric, e]))
  } catch {
    try {
      const { default: list } = await fallbackImport()
      return Object.fromEntries(list.map(e => [e.metric, e]))
    } catch {
      return {}
    }
  }
}

/** i3: why a metric is drifting, in astronaut-facing text (research/explanations.json). */
const fetchExplain = () => fetchByMetric('/api/explain', () => import('../../../data/precomputed/explain.json'))

/** i4: "if this keeps up, it'll be red in N days" for metrics still trending there. */
const fetchForecast = () => fetchByMetric('/api/forecast', () => import('../../../data/precomputed/forecast.json'))

/**
 * Live: GET /api/status and GET /api/readings, colors come from the server.
 * If the server is down, falls back to the sample file (data/mock/day143.json), loaded only when needed
 * so it does not slow down the normal page.
 * Returns { status, readings, explain, forecast, mode: 'live' | 'sample' }.
 */
export async function loadDashboard() {
  try {
    const [status, readings, explain, forecast] = await Promise.all([
      getJson(`/api/status?crewId=${CREW_ID}${langQuery()}`),
      getJson(`/api/readings?crewId=${CREW_ID}`),
      fetchExplain(),
      fetchForecast(),
    ])
    return { status, readings, explain, forecast, mode: 'live' }
  } catch {
    const { default: sample } = await import('../../../data/mock/day143.json')
    return {
      status: localStatus(sample, thresholds, CREW_ID),
      readings: sample,
      explain: await fetchExplain(),
      forecast: await fetchForecast(),
      mode: 'sample',
    }
  }
}
