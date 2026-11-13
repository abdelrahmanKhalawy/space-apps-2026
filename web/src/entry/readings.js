import { BP, GLUCOSE, SLEEP, MOOD, CREW_ID, SOURCE } from './metrics.js'

// Pure functions: validate what the astronaut typed, then turn it into readings
// in the shape of contracts/reading.md. No React in here so it is easy to test.

function parseNumber(text) {
  if (text === '' || text === null || text === undefined) return null
  const n = Number(String(text).trim())
  return Number.isFinite(n) ? n : NaN
}

function checkRange(spec, n, label = spec.label) {
  if (Number.isNaN(n)) return `${label}: enter a number.`
  if (n < spec.min || n > spec.max) {
    return `${label}: ${n} ${spec.unit} is not a possible value. Enter ${spec.min} to ${spec.max} ${spec.unit}.`
  }
  return null
}

/**
 * values: { systolic: string, diastolic: string, glucose: string, sleep: number|null, mood: number|null }
 * Returns { errors: { fieldName: message }, parsed } where parsed holds only what was filled in.
 */
export function validate(values) {
  const errors = {}
  const parsed = {}

  const sys = parseNumber(values.systolic)
  const dia = parseNumber(values.diastolic)
  if (sys !== null || dia !== null) {
    if (sys === null) errors.systolic = 'Blood pressure needs both numbers. Enter the upper one too.'
    if (dia === null) errors.diastolic = 'Blood pressure needs both numbers. Enter the lower one too.'
    if (sys !== null) {
      const e = checkRange(BP.systolic, sys)
      if (e) errors.systolic = e
    }
    if (dia !== null) {
      const e = checkRange(BP.diastolic, dia)
      if (e) errors.diastolic = e
    }
    if (!errors.systolic && !errors.diastolic) {
      if (sys <= dia) errors.systolic = 'The upper number must be higher than the lower one.'
      else parsed.bp = { systolic: sys, diastolic: dia }
    }
  }

  const glucose = parseNumber(values.glucose)
  if (glucose !== null) {
    const e = checkRange(GLUCOSE, glucose)
    if (e) errors.glucose = e
    else parsed.glucose = glucose
  }

  if (values.sleep !== null && values.sleep !== undefined) {
    const e = checkRange(SLEEP, values.sleep)
    if (e) errors.sleep = e
    else parsed.sleep = values.sleep
  }

  if (values.mood !== null && values.mood !== undefined) {
    if (!MOOD.options.some(o => o.value === values.mood)) errors.mood = 'Pick one of the five faces.'
    else parsed.mood = values.mood
  }

  if (Object.keys(errors).length === 0 && Object.keys(parsed).length === 0) {
    errors.form = 'Enter at least one measurement before sending.'
  }

  return { errors, parsed }
}

// 2026-11-13T10:15:00Z: UTC, whole seconds, ends in Z, as the contract requires.
export function utcNow(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Turns validated input into the list of readings to POST. Blood pressure becomes two readings with the SAME takenAt. */
export function buildReadings(parsed, takenAt = utcNow()) {
  const make = (spec, value) => ({
    crewId: CREW_ID,
    metric: spec.metric,
    value,
    unit: spec.unit,
    takenAt,
    source: SOURCE,
  })

  const readings = []
  if (parsed.bp) {
    readings.push(make(BP.systolic, parsed.bp.systolic))
    readings.push(make(BP.diastolic, parsed.bp.diastolic))
  }
  if (parsed.glucose !== undefined) readings.push(make(GLUCOSE, parsed.glucose))
  if (parsed.sleep !== undefined) readings.push(make(SLEEP, parsed.sleep))
  if (parsed.mood !== undefined) readings.push(make(MOOD, parsed.mood))
  return readings
}

/** Sleep stepper: first tap lands on the starting value, then moves by half an hour inside 0 to 24. */
export function stepSleep(current, direction) {
  if (current === null || current === undefined) return SLEEP.start
  const next = Math.round((current + direction * SLEEP.step) * 2) / 2
  return Math.min(SLEEP.max, Math.max(SLEEP.min, next))
}
