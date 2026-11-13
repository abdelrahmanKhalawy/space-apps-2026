// Display names and ordering for the dashboard. Metric keys come from contracts/reading.md.

export const METRIC_ORDER = [
  'heart_rate',
  'spo2',
  'temperature',
  'bp_systolic',
  'bp_diastolic',
  'glucose',
  'sleep_hours',
  'mood',
]

export const METRIC_NAMES = {
  heart_rate: 'Heart rate',
  spo2: 'Oxygen (SpO₂)',
  // The device reads the fingertip, so this is skin temperature, not core body temperature.
  temperature: 'Skin temperature',
  bp_systolic: 'Blood pressure (upper)',
  bp_diastolic: 'Blood pressure (lower)',
  glucose: 'Blood sugar',
  sleep_hours: 'Sleep',
  mood: 'Mood',
}

export const UNIT_LABELS = { C: '°C', score: '/ 5' }

// The five NASA hazards, from contracts/thresholds.md.
export const HAZARD_NAMES = {
  radiation: 'Radiation',
  isolation: 'Isolation & confinement',
  distance: 'Distance from Earth',
  gravity: 'Gravity',
  environment: 'Closed environment',
}

export const COLOR_NAMES = { green: 'Green', yellow: 'Yellow', red: 'Red' }

// The word on an indicator's status pill. The color is never the only signal.
export const STATUS_WORDS = { green: 'Healthy', yellow: 'Watch', red: 'Act now' }

// Where a reading came from, as the astronaut reads it (contracts/reading.md: device, manual, camera, mock).
export const SOURCE_LABELS = {
  device: 'Finger device',
  manual: 'Entered by crew',
  camera: 'Phone camera',
  mock: 'Sample data',
}

export const unitLabel = unit => UNIT_LABELS[unit] ?? unit
