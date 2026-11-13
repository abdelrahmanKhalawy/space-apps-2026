// What the crew member lets Earth see. Medical privacy is a real question for astronauts, so each group of
// indicators can be switched off for reports to the ground. One rule never bends: a RED alert is always
// sent (the ground must know an emergency exists), only its details are held back.
import { buildReport } from '../decision/mission.js'

export const GROUPS = {
  vitals: { label: 'Heart rate, oxygen, skin temperature', metrics: ['heart_rate', 'spo2', 'temperature'] },
  blood: { label: 'Blood pressure and blood sugar', metrics: ['bp_systolic', 'bp_diastolic', 'glucose'] },
  behavior: { label: 'Sleep and mood', metrics: ['sleep_hours', 'mood'] },
}
export const ALL_ON = Object.fromEntries(Object.keys(GROUPS).map(k => [k, true]))
const KEY = 'astropulse.consent.v1'

export function loadConsent(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) ?? 'null')
    return v && typeof v === 'object' ? { ...ALL_ON, ...v } : { ...ALL_ON }
  } catch {
    return { ...ALL_ON }
  }
}
export function saveConsent(consent, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(consent))
  } catch {
    /* private window: the choice just won't be remembered */
  }
}

export const groupOf = metric => Object.keys(GROUPS).find(g => GROUPS[g].metrics.includes(metric))
export const isShared = (metric, consent) => consent[groupOf(metric)] !== false

/** Same body as buildReport (contracts/api.md), with withheld details left out. A red alert is still sent. */
export function buildReportWithConsent({ consent, reds, ...rest }) {
  const shared = reds.filter(r => isShared(r.metric, consent))
  const withheld = reds.length - shared.length
  const body = buildReport({ ...rest, reds: shared })
  if (withheld > 0) {
    const note = shared.length === 0
      ? 'A red alert was raised. The crew member chose not to share the details.'
      : `${withheld} more red indicator${withheld === 1 ? ' was' : 's were'} withheld by the crew member's choice.`
    body.summary = [body.summary, note].filter(Boolean).join(' ')
  }
  return body
}
