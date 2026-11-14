// Run: node web/src/protocol/logic.test.mjs
import { readFileSync } from 'node:fs'
import { REMEASURABLE, attemptsSummary, buildProtocol, distanceToGreen, evaluateRemeasure, waitFromText } from './logic.js'

const raw = JSON.parse(readFileSync(new URL('../../../research/thresholds.json', import.meta.url), 'utf8'))
const thresholds = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')))

let failed = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); if (!ok) failed++ }

{
  const p = buildProtocol({ metric: 'heart_rate', color: 'red', advice: thresholds.heart_rate.advice_en.red })
  check('the description sentence is not an instruction', !p.instructions.some(s => /far from the usual range/.test(s)) && p.described.length === 1, p.instructions.join(' | '))
  const y = buildProtocol({ metric: 'heart_rate', color: 'yellow', advice: thresholds.heart_rate.advice_en.yellow })
  check('yellow heart rate keeps "Rest for 10 minutes, drink some water"', y.instructions.some(s => /Rest for 10 minutes/.test(s)), y.instructions.join(' | '))
}
check('wait time is read from the advice text', waitFromText('Rest for 10 minutes, drink some water.') === 600 && waitFromText('measure again in 15 minutes') === 900)
check('no time in the text -> null', waitFromText('Take a deep breath.') === null)

// every indicator and color the app can show gets a usable pathway built from its real advice text
for (const metric of Object.keys(thresholds)) {
  for (const color of ['yellow', 'red']) {
    const p = buildProtocol({ metric, color, advice: thresholds[metric].advice_en[color] })
    check(`${metric} ${color}: has instructions`, p.instructions.length > 0, p.instructions.join(' | ').slice(0, 70))
    check(`${metric} ${color}: wait matches measurability`, REMEASURABLE.includes(metric) ? p.waitSeconds > 0 : p.waitSeconds === 0 && p.followUpTomorrow)
  }
}
{
  const hr = buildProtocol({ metric: 'heart_rate', color: 'yellow', advice: thresholds.heart_rate.advice_en.yellow })
  check('heart rate yellow: rests 10 minutes then re-measures, does not report first', hr.waitSeconds === 600 && hr.remeasure && !hr.reportFirst)
  const red = buildProtocol({ metric: 'heart_rate', color: 'red', advice: thresholds.heart_rate.advice_en.red })
  check('heart rate red: Earth is told first', red.reportFirst)
  const bp = buildProtocol({ metric: 'bp_systolic', color: 'yellow', advice: thresholds.bp_systolic.advice_en.yellow })
  check('upper blood pressure yellow: waits 15 minutes', bp.waitSeconds === 900)
  const sleep = buildProtocol({ metric: 'sleep_hours', color: 'red', advice: thresholds.sleep_hours.advice_en.red })
  check('sleep: no re-measure, a follow-up tomorrow', !sleep.remeasure && sleep.followUpTomorrow)
}

// the decision after re-measuring
const hrRules = thresholds.heart_rate // green 60..100, yellow 100..120 and 50..60, red >=120 or <50
const ev = (before, after) => evaluateRemeasure({ rules: hrRules, beforeValue: before, afterValue: after })
check('112 -> 92: recovered, keep monitoring', ev(112, 92).outcome === 'recovered' && ev(112, 92).next === 'monitor')
check('130 (red) -> 110 (yellow): better, measure again', ev(130, 110).outcome === 'better' && ev(130, 110).next === 'recheck')
check('112 -> 111: same color, barely closer -> same, tell Earth', ev(112, 111).outcome === 'same' && ev(112, 111).next === 'tell_earth')
check('112 -> 105: same color but clearly closer -> better', ev(112, 105).outcome === 'better')
check('110 -> 125: red now -> worse, tell Earth', ev(110, 125).outcome === 'worse' && ev(110, 125).next === 'tell_earth')
check('low side works too: 55 (yellow) -> 62 recovered', ev(55, 62).outcome === 'recovered')
check('distance to green', distanceToGreen(hrRules, 112) === 12 && distanceToGreen(hrRules, 80) === 0 && distanceToGreen(hrRules, 55) === 5)

check('the report line says what was tried and what changed', (() => {
  const t = attemptsSummary({ name: 'Heart rate', instructions: ['Rest for 10 minutes', 'Drink some water.'], beforeText: '112 bpm', afterText: '111 bpm', waitMinutes: 10, outcome: 'same' })
  return t.includes('Rest for 10 minutes; Drink some water') && t.includes('112 bpm -> 111 bpm') && t.includes('no change')
})())

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
