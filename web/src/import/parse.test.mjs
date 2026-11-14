// Run: node web/src/import/parse.test.mjs
import { readFileSync } from 'node:fs'
import { readingsFromCsv, sampleCsv, toDay } from './parse.js'
import { buildReplay } from '../replay/logic.js'

let failed = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); if (!ok) failed++ }

const fitbit = 'Date,Resting Heart Rate,Minutes Asleep\n2026-10-01,52,455\n2026-10-02,53,440\n2026-10-03,51,470\n'
const r1 = readingsFromCsv(fitbit)
check('Fitbit-style: columns found, sleep minutes -> hours', r1.days === 3 && r1.detected.heartRate === 'Resting Heart Rate' && r1.readings.find(r => r.metric === 'sleep_hours').value === 7.58, JSON.stringify(r1.detected))

const generic = 'date;resting_heart_rate;sleep_hours\n2026-10-01;61,5;7.2\n2026-10-02;62;6.9\n'
const r2 = readingsFromCsv(generic)
check('semicolons and decimal commas', r2.days === 2 && r2.readings[0].value === 61.5 && r2.readings.some(r => r.metric === 'sleep_hours' && r.value === 7.2))

const noSleep = 'day\theart rate\n10/03/2026\t58\n10/04/2026\t59\n'
const r3 = readingsFromCsv(noSleep)
check('tab separated, no sleep column, MM/DD dates', r3.days === 2 && !r3.readings.some(r => r.metric === 'sleep_hours') && r3.readings[0].takenAt.startsWith('2026-10-03'))

check('dates: ISO with time, day-first when the first number is above 12, impossible dates rejected',
  toDay('2026-11-03T07:00:00Z') === '2026-11-03' && toDay('23/11/2026') === '2026-11-23' && toDay('2026-02-31') === null && toDay('hello') === null)

const bad = readingsFromCsv('date,resting heart rate\n2026-10-01,52\n2026-10-02,500\nnot a date,60\n2026-10-04,\n')
check('rows with impossible values or no date are skipped and reported', bad.days === 1 && bad.warnings.some(w => /3 rows skipped/.test(w)), bad.warnings.join(' | '))
check('no date column -> a clear message, no crash', readingsFromCsv('a,b\n1,2\n').warnings.some(w => /No date column/.test(w)))
check('empty file', readingsFromCsv('').warnings.length === 1)
check('byte-order mark from Excel is ignored', readingsFromCsv('﻿Date,RHR\n2026-10-01,60\n').days === 1)

// the sample runs through the same logic as the Replay screen: a low-resting-HR athlete
const raw = JSON.parse(readFileSync(new URL('../../../research/thresholds.json', import.meta.url), 'utf8'))
const thresholds = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')))
const sample = readingsFromCsv(sampleCsv())
check('sample file is 30 days', sample.days === 30)
const rp = buildReplay(sample.readings, thresholds, ['heart_rate', 'sleep_hours'])
const hr = rp.rows.find(r => r.metric === 'heart_rate')
const yellowDays = hr.colors.filter(c => c !== 'green').length
check('the athlete\'s normal sits below the fixed 60-100 range: fixed colors flag nearly every day', yellowDays >= 25, `${yellowDays} of 30 days not green`)
check('the personal baseline stays quiet in the healthy weeks and speaks up during the illness', hr.modelAlarm != null && hr.modelAlarm >= 24, `alarm on day ${hr.modelAlarm + 1}`)

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
