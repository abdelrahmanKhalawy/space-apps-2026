import { useEffect, useRef, useState } from 'react'

const CREW_ID = 'crew-1'

// 2026-11-13T21:15:00Z: whole seconds, as contracts/reading.md asks.
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

// A gentle wobble around a healthy resting value, so the demo looks alive without
// ever drifting into a color the judge didn't cause themselves.
function reading(metric, unit, base, spread, takenAtMs) {
  const value = Math.round((base + (Math.random() - 0.5) * spread) * 10) / 10
  return { crewId: CREW_ID, metric, value, unit, takenAt: iso(takenAtMs), source: 'device' }
}

/** "Press your finger on the sensor" button: sends the same 3 readings a real
 * device would, on the same path (POST /api/readings), every 2 seconds. */
export default function DeviceSimulator() {
  const [on, setOn] = useState(false)
  const [error, setError] = useState(false)
  const timer = useRef(null)
  // When the server's newest reading of each metric was taken. The dashboard shows the newest reading BY TIME,
  // so a simulated reading older than that (sample data runs to the end of 13 Nov UTC) would never show up.
  const newest = useRef({})

  const learnNewest = async () => {
    try {
      const res = await fetch(`/api/status?crewId=${CREW_ID}`)
      if (!res.ok) return
      const status = await res.json()
      for (const m of status.metrics ?? []) newest.current[m.metric] = Date.parse(m.takenAt)
    } catch {
      /* no status yet: the clock is enough */
    }
  }

  // The current time, or one second after the newest reading the server has, whichever is later.
  const timeFor = metric => {
    const t = Math.max(Date.now(), (newest.current[metric] ?? 0) + 1000)
    newest.current[metric] = t
    return t
  }

  const sendBatch = async () => {
    const body = [
      reading('heart_rate', 'bpm', 72, 6, timeFor('heart_rate')),
      reading('spo2', '%', 97, 1.5, timeFor('spo2')),
      reading('temperature', 'C', 34.2, 0.6, timeFor('temperature')),
    ]
    try {
      const res = await fetch('/api/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setError(!res.ok)
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    if (!on) {
      clearInterval(timer.current)
      timer.current = null
      return
    }
    let cancelled = false
    ;(async () => {
      await learnNewest()
      if (cancelled) return
      sendBatch() // first one right away, so the judge doesn't wait 2s for anything to happen
      timer.current = setInterval(sendBatch, 2000)
    })()
    return () => {
      cancelled = true
      clearInterval(timer.current)
    }
  }, [on])

  return (
    <button
      type="button"
      className={on ? 'device-sim on' : 'device-sim'}
      onClick={() => setOn(v => !v)}
      aria-pressed={on}
      title="Simulates the finger sensor, in case the real device isn't connected"
    >
      {on ? '● Finger on sensor' : 'Simulate device'}
      {error && <small> — can't reach the server</small>}
    </button>
  )
}
