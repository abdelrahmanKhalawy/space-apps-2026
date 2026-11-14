// Run: node web/src/evidence/parity.mjs
// Checks the JS detectors in trial.js give the same alarm days as ai/trial.py on the
// published fixture crews (data/trial/results.json). Exits 1 on any mismatch.
import { readFileSync } from 'node:fs'
import { allAlarms } from './trial.js'

const root = new URL('../../../', import.meta.url)
const results = JSON.parse(readFileSync(new URL('data/trial/results.json', root), 'utf8'))
const thresholds = JSON.parse(readFileSync(new URL('research/thresholds.json', root), 'utf8'))
const bands = Object.fromEntries(Object.entries(thresholds).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v.bands]))

let bad = 0
results.fixtures.forEach((f, i) => {
  const got = allAlarms(f.series, bands, results.config, results.calibration)
  for (const key of Object.keys(f.alarms)) {
    if (got[key] !== f.alarms[key]) {
      bad++
      console.error(`crew ${i} ${key}: python ${f.alarms[key]} vs js ${got[key]}`)
    }
  }
})
console.log(bad === 0 ? `parity OK on ${results.fixtures.length} crews` : `${bad} mismatches`)
process.exit(bad === 0 ? 0 : 1)
