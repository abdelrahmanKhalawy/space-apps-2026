import thresholds from './thresholds.js'
import { localStatus } from './status.js'

const CREW_ID = 'crew-1'

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res.json()
}

/** Just the current status (what the live body polls). Returns null if the server cannot be reached. */
export async function fetchStatus() {
  try {
    return await getJson(`/api/status?crewId=${CREW_ID}`)
  } catch {
    return null
  }
}

/** i3: why a metric is drifting, in astronaut-facing text (research/explanations.json,
 * via the server's precomputed fallback). Keyed by metric. Empty object if unavailable —
 * the dashboard already works fine with no "why" text, it just won't show one. */
async function fetchExplain() {
  try {
    const list = await getJson('/api/explain')
    return Object.fromEntries(list.map(e => [e.metric, e]))
  } catch {
    try {
      const { default: list } = await import('../../../data/precomputed/explain.json')
      return Object.fromEntries(list.map(e => [e.metric, e]))
    } catch {
      return {}
    }
  }
}

/**
 * Live: GET /api/status and GET /api/readings, colors come from the server.
 * If the server is down, falls back to the sample file (data/mock/day143.json), loaded only when needed
 * so it does not slow down the normal page.
 * Returns { status, readings, explain, mode: 'live' | 'sample' }.
 */
export async function loadDashboard() {
  try {
    const [status, readings, explain] = await Promise.all([
      getJson(`/api/status?crewId=${CREW_ID}`),
      getJson(`/api/readings?crewId=${CREW_ID}`),
      fetchExplain(),
    ])
    return { status, readings, explain, mode: 'live' }
  } catch {
    const { default: sample } = await import('../../../data/mock/day143.json')
    return { status: localStatus(sample, thresholds, CREW_ID), readings: sample, explain: await fetchExplain(), mode: 'sample' }
  }
}
