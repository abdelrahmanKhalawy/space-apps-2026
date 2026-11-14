// Guided care pathway: when an indicator is yellow or red, the app walks the crew member through
//   what to do now  ->  wait  ->  measure again  ->  a decision (recovered / better / not better -> tell Earth, with what was tried).
// The idea follows NASA's work on autonomous medical support for the crew (just-in-time guidance and a triage level,
// supporting the crew member and not replacing a doctor). The steps themselves are the advice texts from
// research/thresholds.json; this file only adds the structure, the timing and the decision.
// It is decision support for a prototype, not medical advice.
import { splitSteps } from '../decision/mission.js'

// Indicators that make sense to measure again after a short wait. Sleep and mood are follow-ups for tomorrow.
export const REMEASURABLE = ['heart_rate', 'spo2', 'temperature', 'bp_systolic', 'bp_diastolic', 'glucose']
const DEFAULT_WAIT_SECONDS = 10 * 60
const SEVERITY = { green: 0, yellow: 1, red: 2 }

function colorOf(rules, value) {
  for (const b of rules?.bands ?? []) {
    if ((b.min === undefined || value >= b.min) && (b.max === undefined || value < b.max)) return b.color
  }
  return null
}

/** "Rest for 10 minutes", "measure again in 15 minutes" -> seconds. null if the text names no time. */
export function waitFromText(text) {
  const m = /(\d+)\s*(?:minutes?|mins?)\b/i.exec(text ?? '')
  return m ? Number(m[1]) * 60 : null
}

const isReport = s => /\b(tell|call|report)\b.*\b(flight surgeon|earth|ground)\b|\b(flight surgeon|ground)\b/i.test(s)
const isMeasure = s => /\bmeasure\b.*\bagain\b|\bmeasure again\b/i.test(s)
// The first sentence of each advice text only describes the reading ("Your heart rate is far from the usual range."):
// it is not something the crew member does, so it is not an instruction and not something "tried".
const isDescription = s => /^(your|you are|you're|this)\b/i.test(s) && !/\b(rest|drink|stop|take|open|check|keep|cut|dim|talk|think|measure)\b/i.test(s)

/**
 * metric, color ('yellow' | 'red'), adviceText (the sentences from the color advice), thresholds (by metric).
 * Returns { metric, color, instructions[], waitSeconds, remeasure, reportFirst, followUpTomorrow }.
 */
export function buildProtocol({ metric, color, advice }) {
  // One advice sentence can hold several steps: "Stop any effort and tell the flight surgeon." (stop, tell) and
  // "Rest for 10 minutes, drink some water, then measure again." (rest, drink, measure again).
  const cap = p => `${p.charAt(0).toUpperCase()}${p.slice(1)}.`
  const sentences = splitSteps(advice).flatMap(s => {
    let parts = [s.replace(/\.$/, '')]
    parts = parts.flatMap(p => p.split(/\s+and\s+(?=(?:tell|call|report)\b)/i))
    parts = parts.flatMap(p => {
      const m = /^(.*?)[,;]?\s*(?:and\s+|then\s+)?(measure again(?:\s+in\s+\d+\s*(?:minutes?|mins?))?)$/i.exec(p)
      return m && m[1].trim() ? [m[1].trim(), m[2]] : [p]
    })
    return parts.map(p => p.trim()).filter(Boolean).map(cap)
  })
  const instructions = sentences.filter(s => !isMeasure(s) && !isReport(s) && !isDescription(s))
  const waits = sentences.map(waitFromText).filter(w => w != null)
  const remeasure = REMEASURABLE.includes(metric)
  return {
    metric,
    color,
    instructions: instructions.length > 0 ? instructions : sentences.filter(isReport), // e.g. only "Tell the flight surgeon."
    described: sentences.filter(isDescription),
    waitSeconds: remeasure ? Math.max(...waits, 0) || DEFAULT_WAIT_SECONDS : 0,
    remeasure,
    // red: Earth is told straight away (the crew does not wait for a re-measure), and the re-measure runs while waiting
    reportFirst: color === 'red' || sentences.some(isReport) && color !== 'yellow',
    followUpTomorrow: !remeasure,
  }
}

/** How far a value is from the nearest green band: 0 inside it. Used to say "closer" or "further" without a doctor's judgment. */
export function distanceToGreen(rules, value) {
  const greens = (rules?.bands ?? []).filter(b => b.color === 'green')
  if (greens.length === 0) return null
  return Math.min(...greens.map(b => {
    const lo = b.min ?? -Infinity
    const hi = b.max ?? Infinity
    return value < lo ? lo - value : value >= hi ? value - hi : 0
  }))
}

/**
 * Compare the new measurement with the one that started the pathway.
 * Returns { outcome: 'recovered' | 'better' | 'same' | 'worse', afterColor, next: 'monitor' | 'recheck' | 'tell_earth' }.
 */
export function evaluateRemeasure({ rules, beforeValue, afterValue }) {
  const beforeColor = colorOf(rules, beforeValue)
  const afterColor = colorOf(rules, afterValue)
  const db = distanceToGreen(rules, beforeValue)
  const da = distanceToGreen(rules, afterValue)
  let outcome
  if (afterColor === 'green') outcome = 'recovered'
  else if (SEVERITY[afterColor] > SEVERITY[beforeColor]) outcome = 'worse'
  else if (SEVERITY[afterColor] < SEVERITY[beforeColor]) outcome = 'better'
  else if (db != null && da != null && da <= db * 0.9) outcome = 'better' // same color, at least 10% closer to green
  else if (db != null && da != null && da >= db * 1.1) outcome = 'worse'
  else outcome = 'same'
  const next = outcome === 'recovered' ? 'monitor' : outcome === 'better' ? 'recheck' : 'tell_earth'
  return { outcome, beforeColor, afterColor, next }
}

export const OUTCOME_TEXT = {
  recovered: 'Back in your usual range. Keep monitoring and log how you feel.',
  better: 'Moving the right way, but not back in range yet. Rest a little longer and measure again.',
  same: 'No real change. This is the point to tell the flight surgeon what you tried.',
  worse: 'It got worse. Tell the flight surgeon now, with what you tried.',
}

/** The line added to a report to Earth: what the crew member already did, so the doctor does not start from zero. */
export function attemptsSummary({ name, instructions, beforeText, afterText, waitMinutes, outcome }) {
  const did = instructions.length > 0 ? instructions.map(s => s.replace(/\.$/, '')).join('; ') : 'followed the on-screen steps'
  const change = { recovered: 'back in range', better: 'closer to range but not back', same: 'no change', worse: 'worse' }[outcome]
  return `${name}: tried "${did}". Re-measured after ${waitMinutes} min: ${beforeText} -> ${afterText} (${change}).`
}
