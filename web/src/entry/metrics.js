// The four indicators entered by hand (the phone camera and the simulator cover the pulse).
// Names and units come from contracts/reading.md and must match it exactly.
//
// min/max are INPUT SANITY limits only: they reject numbers that cannot be real
// (heart rate 0, blood pressure 400). They are not health thresholds. The green /
// yellow / red bands come from research/thresholds.json, not from this file.

export const CREW_ID = 'crew-1'
export const SOURCE = 'manual'

export const BP = {
  systolic: { metric: 'bp_systolic', unit: 'mmHg', label: 'Upper (systolic)', min: 50, max: 260 },
  diastolic: { metric: 'bp_diastolic', unit: 'mmHg', label: 'Lower (diastolic)', min: 30, max: 160 },
}

export const GLUCOSE = { metric: 'glucose', unit: 'mg/dL', label: 'Blood sugar', min: 20, max: 600 }

export const SLEEP = {
  metric: 'sleep_hours',
  unit: 'h',
  label: 'Sleep last night',
  min: 0,
  max: 24,
  step: 0.5,
  start: 7, // first tap on + or - lands here, so nothing is sent by accident
}

export const MOOD = {
  metric: 'mood',
  unit: 'score',
  label: 'Mood',
  options: [
    { value: 1, emoji: '😞', text: 'Very low' },
    { value: 2, emoji: '😕', text: 'Low' },
    { value: 3, emoji: '😐', text: 'Okay' },
    { value: 4, emoji: '🙂', text: 'Good' },
    { value: 5, emoji: '😄', text: 'Great' },
  ],
}

// Display names for the confirmation panel, by metric key.
export const METRIC_LABELS = {
  bp_systolic: 'Blood pressure (upper)',
  bp_diastolic: 'Blood pressure (lower)',
  glucose: 'Blood sugar',
  sleep_hours: 'Sleep',
  mood: 'Mood',
}
