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

/**
 * Live: GET /api/status and GET /api/readings, colors come from the server.
 * If the server is down, falls back to the sample file (data/mock/day143.json), loaded only when needed
 * so it does not slow down the normal page.
 * Returns { status, readings, mode: 'live' | 'sample' }.
 */
export async function loadDashboard() {
  try {
    const [status, readings] = await Promise.all([
      getJson(`/api/status?crewId=${CREW_ID}`),
      getJson(`/api/readings?crewId=${CREW_ID}`),
    ])
    return { status, readings, mode: 'live' }
  } catch {
    const { default: sample } = await import('../../../data/mock/day143.json')
    return { status: localStatus(sample, thresholds, CREW_ID), readings: sample, mode: 'sample' }
  }
}
