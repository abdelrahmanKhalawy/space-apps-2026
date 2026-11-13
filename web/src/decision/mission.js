// Mission places and message delays for the decision screen.
// One-way delays mirror the table in contracts/api.md (the server uses the same numbers for /api/reports).

export const MISSIONS = {
  iss: { label: 'Space station', short: 'Station', oneWaySeconds: 1 },
  moon: { label: 'Moon', short: 'Moon', oneWaySeconds: 1.25 },
  mars: { label: 'Mars', short: 'Mars', oneWaySeconds: 20 * 60 }, // the demo uses the 20 minute worst case
}

export const DEFAULT_MISSION = 'mars'

// If Earth cannot answer within this many seconds, the screen says: do not wait, act now.
export const WAIT_LIMIT_SECONDS = 5 * 60

export const roundTripSeconds = mission => 2 * (MISSIONS[mission]?.oneWaySeconds ?? 0)

export const shouldWaitForEarth = mission => roundTripSeconds(mission) <= WAIT_LIMIT_SECONDS

/** "about 40 min", "about 2.5 seconds", "about 1 h 5 min". */
export function formatDuration(seconds) {
  if (seconds < 60) {
    const s = Math.round(seconds * 10) / 10
    return `${s} ${s === 1 ? 'second' : 'seconds'}`
  }
  const totalMin = Math.round(seconds / 60)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Countdown as MM:SS (or H:MM:SS), never negative. */
export function formatCountdown(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** The red advice in research/thresholds.json is a few short sentences. Each one becomes a step. */
export function splitSteps(advice) {
  if (!advice) return []
  return advice
    .split(/(?<=[.!؟?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** Body for POST /api/reports, as in contracts/api.md. */
export function buildReport({ crewId, mission, reds, namer, formatValueFn }) {
  return {
    crewId,
    mission,
    severity: 'red',
    summary: reds.map(r => `${namer(r.metric)} ${formatValueFn(r.metric, r.value)} is in the red zone.`).join(' '),
    metrics: reds.map(r => r.metric),
  }
}

/**
 * Times for a report that the server did not return (offline fallback), using the same rule as the server:
 * it arrives after one way, and the earliest reply is one more way after that.
 */
export function localTimes(mission, now = new Date()) {
  const oneWay = MISSIONS[mission]?.oneWaySeconds ?? 0
  const at = s => new Date(now.getTime() + s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  return { sentAt: at(0), deliverAt: at(oneWay), replyEarliestAt: at(oneWay * 2) }
}
