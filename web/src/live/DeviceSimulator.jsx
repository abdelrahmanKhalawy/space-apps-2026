import { useEffect, useRef, useState } from 'react'

const CREW_ID = 'crew-1'

// A gentle wobble around a healthy resting value, so the demo looks alive without
// ever drifting into a color the judge didn't cause themselves.
function reading(metric, unit, base, spread) {
  const value = Math.round((base + (Math.random() - 0.5) * spread) * 10) / 10
  return { crewId: CREW_ID, metric, value, unit, takenAt: new Date().toISOString(), source: 'device' }
}

/** "Press your finger on the sensor" button: sends the same 3 readings a real
 * device would, on the same path (POST /api/readings), every 2 seconds. */
export default function DeviceSimulator() {
  const [on, setOn] = useState(false)
  const [error, setError] = useState(false)
  const timer = useRef(null)

  const sendBatch = async () => {
    const body = [
      reading('heart_rate', 'bpm', 72, 6),
      reading('spo2', '%', 97, 1.5),
      reading('temperature', 'C', 34.2, 0.6),
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
    sendBatch() // first one right away, so the judge doesn't wait 2s for anything to happen
    timer.current = setInterval(sendBatch, 2000)
    return () => clearInterval(timer.current)
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
