// Run: node web/src/replay/logic.test.mjs
import { readFileSync } from 'node:fs'
import { buildReplay, modelAlarmDay } from './logic.js'

const root = new URL('../../../', import.meta.url)
const readings = JSON.parse(readFileSync(new URL('data/mock/day143.json', root), 'utf8'))
const raw = JSON.parse(readFileSync(new URL('research/thresholds.json', root), 'utf8'))
const thresholds = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')))
const ORDER = ['heart_rate', 'spo2', 'temperature', 'bp_systolic', 'bp_diastolic', 'glucose', 'sleep_hours', 'mood']

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
  if (!ok) failed++
}

const r = buildReplay(readings, thresholds, ORDER)
const row = m => r.rows.find(x => x.metric === m)
console.log('model alarm day / first non-green day (1-based):')
for (const x of r.rows) console.log(`   ${x.metric.padEnd(13)} model ${x.modelAlarm == null ? '-' : x.modelAlarm + 1}  colors ${x.firstNonGreen == null ? 'never' : x.firstNonGreen + 1}  red ${x.firstRed == null ? 'never' : x.firstRed + 1}`)

check('14 days of 8 indicators', r.days.length === 14 && r.rows.length === 8)
check('heart rate: model speaks, colors never leave green', row('heart_rate').modelAlarm != null && row('heart_rate').firstNonGreen == null)
check('mood: model speaks before the colors', row('mood').modelAlarm != null && (row('mood').firstNonGreen == null || row('mood').modelAlarm < row('mood').firstNonGreen))
check('"earlier" list includes heart rate and mood', ['heart_rate', 'mood'].every(m => r.earlier.some(x => x.metric === m)))
check('quiet indicators stay quiet', ['spo2', 'temperature'].every(m => row(m).modelAlarm == null))
check('the model never speaks inside the baseline week', r.rows.every(x => x.modelAlarm == null || x.modelAlarm >= 7 + 4 - 1))
check('index rises from steady to act-now', r.index[0].score < 25 && r.index[13].label.label === 'Act now', `${r.index[0].score} -> ${r.index[13].score}`)
check('alarm needs four days of evidence', modelAlarmDay([5, 5, 5, 5, 5, 5, 5, 9, 9, 9], 'heart_rate') === null && modelAlarmDay([5, 5, 5, 5, 5, 5, 5, 9, 9, 9, 9], 'heart_rate') === 10)
check('too little history gives no alarm', modelAlarmDay([1, 2, 3], 'mood') === null)

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
