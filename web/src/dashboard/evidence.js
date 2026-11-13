// "How sure are we?" for each indicator: where the color ranges come from, and how solid the link to a
// space hazard is. Drawn from research/sources.md and research/explanations.json (the README names the weak ones).
//   strong    an official medical or NASA source for it
//   moderate  common in medical sources, but not from the page we cite (or the yellow bands are our design)
//   approx    an approximation, no precise source
//   ours      our own inference or our own scale
export const LEVELS = {
  strong: { label: 'Strong', hint: 'Official medical or NASA source' },
  moderate: { label: 'Moderate', hint: 'Common in medical sources; part of it is our design choice' },
  approx: { label: 'Approximate', hint: 'No precise source for this exactly' },
  ours: { label: 'Our own', hint: 'Our inference or our own scale, not a published standard' },
}

export const EVIDENCE = {
  heart_rate: {
    range: { level: 'strong', note: 'Normal 60–100 bpm, American Heart Association. The yellow bands are our design.' },
    link: { level: 'strong', note: "NASA: cardiovascular health in microgravity." },
  },
  spo2: {
    range: { level: 'strong', note: 'Normal 95–100%, MedlinePlus (NIH). The red line under 90% is common in medical sources.' },
    link: { level: 'moderate', note: 'NASA cabin air quality; the link to your reading is our summary.' },
  },
  temperature: {
    range: { level: 'approx', note: 'No medical range exists for fingertip skin temperature. Our range is an approximation.' },
    link: { level: 'moderate', note: 'Cabin temperature is a NASA concern; skin temperature is only a rough signal.' },
  },
  bp_systolic: {
    range: { level: 'strong', note: 'American Heart Association blood pressure categories, merged into three colors.' },
    link: { level: 'strong', note: 'NASA: cardiovascular changes in microgravity.' },
  },
  bp_diastolic: {
    range: { level: 'strong', note: 'American Heart Association blood pressure categories, merged into three colors.' },
    link: { level: 'strong', note: 'NASA: cardiovascular changes in microgravity.' },
  },
  glucose: {
    range: { level: 'strong', note: 'CDC fasting and low-sugar ranges, for a typical adult (not astronaut-specific).' },
    link: { level: 'ours', note: "The blood sugar and isolation link is our own inference from NASA's nutrition research, not a NASA statement." },
  },
  sleep_hours: {
    range: { level: 'strong', note: 'At least 7 hours, CDC. The 9-hour upper limit is from the National Sleep Foundation.' },
    link: { level: 'strong', note: 'NASA: sleep in orbit and behavioral health.' },
  },
  mood: {
    range: { level: 'ours', note: 'A 1–5 self-report scale we designed. There is no standard clinical scale for it.' },
    link: { level: 'strong', note: "NASA's Human Research Program tracks mood as a leading indicator of isolation effects." },
  },
}
