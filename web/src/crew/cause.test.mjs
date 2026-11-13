// Run: node web/src/crew/cause.test.mjs
import { analyzeCause } from './cause.js'
import { makeScenario } from './scenarios.js'

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
  if (!ok) failed++
}

const calm = analyzeCause(makeScenario('calm', 1))
const personal = analyzeCause(makeScenario('personal', 1))
const env = analyzeCause(makeScenario('environment', 1))
check('calm week: nobody flagged', calm.kind === 'none', calm.headline)
check('one drifting person: personal, and it names them', personal.kind === 'personal' && personal.flagged[0] === 'crew-3', personal.headline)
check('everyone drifting: shared', env.kind === 'shared', env.headline)
check('environment scenario also shows high CO2', env.co2High && !personal.co2High && !calm.co2High, `CO2 ${env.co2Now}`)

// How often the rule gets each scenario right across many random crews. Reported, not hidden.
const N = 300
const tally = { calm: 0, personal: 0, environment: 0 }
const want = { calm: 'none', personal: 'personal', environment: 'shared' }
for (let seed = 1; seed <= N; seed++) {
  for (const sc of Object.keys(tally)) if (analyzeCause(makeScenario(sc, seed * 7919)).kind === want[sc]) tally[sc]++
}
for (const sc of Object.keys(tally)) console.log(`   ${sc}: classified correctly ${tally[sc]}/${N} (${((tally[sc] / N) * 100).toFixed(0)}%)`)
check('calm is almost never a false alarm (>= 95%)', tally.calm / N >= 0.95)
check('single drifter is found >= 90%', tally.personal / N >= 0.9)
check('crew-wide drift is called shared >= 85%', tally.environment / N >= 0.85)

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
