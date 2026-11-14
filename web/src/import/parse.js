// "Your own data": read a CSV exported from a watch or a health app (a row per day with resting heart rate and, if present,
// sleep) and turn it into the same readings the app uses. Everything happens in the browser; nothing is uploaded.
//
// Column detection is by header name, so common exports work without a mapping step:
//   Fitbit-style      Date, Resting Heart Rate, Minutes Asleep
//   Generic           date, resting_heart_rate, sleep_hours
//   Apple/Garmin-ish  startDate, restingHeartRate, sleepDuration
// Sleep in minutes (header says "min", or most values are above 24) is converted to hours.

export const MIN_HR = 30
export const MAX_HR = 220

/** Split one CSV line, honoring double quotes. */
function splitLine(line, sep) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (c === sep && !quoted) { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out.map(x => x.trim())
}

export function parseTable(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return { header: [], rows: [] }
  const sep = [',', ';', '\t'].map(s => [s, (lines[0].match(new RegExp(s === '\t' ? '\t' : `\\${s}`, 'g')) ?? []).length]).sort((a, b) => b[1] - a[1])[0][0]
  return { header: splitLine(lines[0], sep), rows: lines.slice(1).map(l => splitLine(l, sep)) }
}

const norm = h => h.toLowerCase().replace(/[^a-z0-9]/g, '')

function findColumn(header, patterns) {
  for (const p of patterns) {
    const i = header.findIndex(h => p.test(norm(h)))
    if (i !== -1) return i
  }
  return -1
}

/** 2026-11-03, 2026/11/03, 03/11/2026 (day first when the first number is above 12), 11/03/2026, 2026-11-03T07:00:00Z -> '2026-11-03' */
export function toDay(raw) {
  const s = String(raw ?? '').trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  let y, mo, d
  if (m) [y, mo, d] = [m[1], m[2], m[3]]
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s))) {
    const a = Number(m[1])
    const b = Number(m[2])
    y = m[3]
    ;[mo, d] = a > 12 ? [m[2], m[1]] : [m[1], m[2]] // a first number above 12 can only be a day
    if (a <= 12 && b > 12) [mo, d] = [m[1], m[2]]
  } else return null
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) return null
  return date.toISOString().slice(0, 10)
}

const num = v => {
  const x = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(x) ? x : null
}

export function readingsFromCsv(text) {
  const { header, rows } = parseTable(text)
  const warnings = []
  if (header.length === 0 || rows.length === 0) return { readings: [], detected: {}, days: 0, warnings: ['The file looks empty.'] }

  const dateCol = findColumn(header, [/^date$/, /^day$/, /startdate/, /^datetime$/, /timestamp/, /date/])
  const hrCol = findColumn(header, [/restingheartrate/, /restinghr/, /^rhr$/, /resting/, /heartrate/, /^hr$/])
  const sleepCol = findColumn(header, [/sleep(hours|hrs|duration|time)/, /minutesasleep/, /totalsleep/, /asleep/, /sleep/])
  if (dateCol === -1) warnings.push('No date column found (looked for "date", "day", "startDate").')
  if (hrCol === -1) warnings.push('No resting heart rate column found (looked for "Resting Heart Rate", "RHR", "heart rate").')
  if (dateCol === -1 || hrCol === -1) return { readings: [], detected: {}, days: 0, warnings }

  // sleep: minutes or hours?
  let sleepInMinutes = false
  if (sleepCol !== -1) {
    const vals = rows.map(r => num(r[sleepCol])).filter(v => v != null)
    const big = vals.filter(v => v > 24).length
    sleepInMinutes = /min/.test(norm(header[sleepCol])) || (vals.length > 0 && big / vals.length > 0.5)
  }

  // one value per day (a later row for the same day wins)
  const byDay = new Map()
  let skipped = 0
  for (const r of rows) {
    const day = toDay(r[dateCol])
    const hr = num(r[hrCol])
    if (!day || hr == null || hr < MIN_HR || hr > MAX_HR) { skipped++; continue }
    let sleep = sleepCol === -1 ? null : num(r[sleepCol])
    if (sleep != null) sleep = sleepInMinutes ? sleep / 60 : sleep
    if (sleep != null && (sleep <= 0 || sleep > 24)) sleep = null
    byDay.set(day, { hr, sleep })
  }
  const days = [...byDay.keys()].sort()
  const readings = []
  for (const day of days) {
    const { hr, sleep } = byDay.get(day)
    readings.push({ crewId: 'you', metric: 'heart_rate', value: hr, unit: 'bpm', takenAt: `${day}T07:00:00Z`, source: 'upload' })
    if (sleep != null) readings.push({ crewId: 'you', metric: 'sleep_hours', value: Math.round(sleep * 100) / 100, unit: 'h', takenAt: `${day}T07:00:00Z`, source: 'upload' })
  }
  if (skipped > 0) warnings.push(`${skipped} row${skipped === 1 ? '' : 's'} skipped (no readable date, or a heart rate outside ${MIN_HR}–${MAX_HR}).`)
  return {
    readings,
    detected: { date: header[dateCol], heartRate: header[hrCol], sleep: sleepCol === -1 ? null : `${header[sleepCol]}${sleepInMinutes ? ' (minutes → hours)' : ''}` },
    days: days.length,
    warnings,
  }
}

/** A made-up athlete with a low resting heart rate (so fixed ranges cry wolf) who gets ill for the last days, for trying the screen. */
export function sampleCsv() {
  const lines = ['Date,Resting Heart Rate,Minutes Asleep']
  const start = Date.UTC(2026, 9, 1)
  for (let i = 0; i < 30; i++) {
    const d = new Date(start + i * 86400000).toISOString().slice(0, 10)
    const wobble = Math.round((Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 1.2)
    const ill = i >= 24 ? (i - 23) * 2.4 : 0
    lines.push(`${d},${Math.round(51 + wobble + ill)},${Math.round(450 + wobble * 8 - ill * 9)}`)
  }
  return lines.join('\n')
}
