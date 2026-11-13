// A simulated crew of four, for the "person or environment?" screen. All synthetic.
// Three scenarios share the same people and noise; only what changes in week 2 differs:
//   calm         nobody drifts
//   personal     one person's sleep and heart rate drift (stress, isolation, health)
//   environment  everyone drifts together while the shared cabin CO2 creeps up
import { mulberry32 } from '../evidence/trial.js'

export const DAYS = 14
export const DRIFT_START = 8 // day index; the first week is each person's baseline
export const CREW = [
  { id: 'crew-1', name: 'Amal' },
  { id: 'crew-2', name: 'Karim' },
  { id: 'crew-3', name: 'Lena' },
  { id: 'crew-4', name: 'Omar' },
]
export const SCENARIO_LABELS = {
  calm: 'Calm week',
  personal: 'One person drifting',
  environment: 'Everyone drifting together',
}
export const CABIN_CO2_LIMIT = 3 // mmHg, the NASA-STD-3001 limit quoted in NASA's CO2 technical brief

const gauss = (rng, sd) => {
  const u = Math.max(rng(), 1e-12)
  return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}
const dateOf = i => new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10)

export function makeScenario(scenario, seed = 1, nameOfDrifter = 'crew-3') {
  const rng = mulberry32(seed)
  const people = CREW.map(p => {
    const normal = { sleep_hours: 6.4 + rng() * 0.9, heart_rate: 60 + rng() * 12 } // everyone's normal is different
    const daily = { sleep_hours: [], heart_rate: [] }
    const drifts = scenario === 'environment' || (scenario === 'personal' && p.id === nameOfDrifter)
    for (let d = 0; d < DAYS; d++) {
      const k = drifts && d >= DRIFT_START ? d - DRIFT_START + 1 : 0
      const strength = scenario === 'environment' ? 0.75 + rng() * 0.5 : 1
      daily.sleep_hours.push(+(normal.sleep_hours + gauss(rng, 0.2) - 0.28 * strength * k).toFixed(2))
      daily.heart_rate.push(+(normal.heart_rate + gauss(rng, 1.4) + 1.1 * strength * k).toFixed(1))
    }
    const readings = []
    for (const [metric, vals] of Object.entries(daily)) {
      vals.forEach((value, d) =>
        readings.push({ crewId: p.id, metric, value, unit: metric === 'sleep_hours' ? 'h' : 'bpm', takenAt: `${dateOf(d)}T07:00:00Z`, source: 'mock' }))
    }
    return { ...p, daily, readings }
  })
  const co2 = []
  for (let d = 0; d < DAYS; d++) {
    const k = scenario === 'environment' && d >= DRIFT_START ? d - DRIFT_START + 1 : 0
    co2.push(+(2.0 + gauss(rng, 0.12) + 0.45 * k).toFixed(2))
  }
  return { scenario, people, cabin: { co2 }, days: DAYS }
}
