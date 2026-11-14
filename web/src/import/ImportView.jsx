import { useMemo, useRef, useState } from 'react'
import thresholds from '../dashboard/thresholds.js'
import { BASELINE_DAYS } from '../dashboard/astroIndex.js'
import { buildReplay } from '../replay/logic.js'
import ReplayGrid from '../replay/ReplayGrid.jsx'
import { readingsFromCsv, sampleCsv } from './parse.js'

// "Your data": drop in a CSV from your own watch or health app and see YOUR normal, next to what fixed ranges say.
// Runs entirely in the browser. Nothing is uploaded, stored or sent.

const MIN_DAYS = BASELINE_DAYS + 4
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length

export default function ImportView() {
  const [parsed, setParsed] = useState(null)
  const [name, setName] = useState('')
  const [dragging, setDragging] = useState(false)
  const input = useRef(null)

  const load = (text, label) => {
    setName(label)
    setParsed(readingsFromCsv(text))
  }
  const onFile = async file => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setName(file.name)
      setParsed({ readings: [], days: 0, detected: {}, warnings: ['That file is over 5 MB. Export just the daily summary (a row per day), not the raw samples.'] })
      return
    }
    load(await file.text(), file.name)
  }

  const replay = useMemo(
    () => (parsed && parsed.days >= MIN_DAYS ? buildReplay(parsed.readings, thresholds, ['heart_rate', 'sleep_hours']) : null),
    [parsed],
  )
  const hr = replay?.rows.find(r => r.metric === 'heart_rate')
  const hrBase = hr ? hr.values.slice(0, BASELINE_DAYS).filter(v => v != null) : []
  const fixedFlagged = hr ? hr.colors.filter(c => c && c !== 'green').length : 0
  const last = replay ? replay.days.length - 1 : 0

  return (
    <section className="import">
      <div className="ev-banner" role="note">
        <strong>Private by design.</strong> Your file is read in this browser tab. Nothing is uploaded, stored or sent anywhere.
      </div>
      <h2>Try it on your own data</h2>
      <p className="hint">
        Export a daily summary from your watch or health app (a row per day with <em>date</em>, <em>resting heart rate</em> and optionally <em>sleep</em>), and drop
        it here. AstroPulse learns your first week, then compares you with <em>yourself</em>, next to the fixed ranges every app uses.
      </p>

      <div
        className={dragging ? 'imp-drop on' : 'imp-drop'}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]) }}
      >
        <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" className="imp-file" aria-label="Choose a CSV file" onChange={e => onFile(e.target.files?.[0])} />
        <button type="button" className="ev-btn" onClick={() => input.current?.click()}>Choose a CSV file</button>
        <span>or drop it here</span>
        <button type="button" className="cam-link" onClick={() => load(sampleCsv(), 'sample file (a made-up athlete)')}>Try a sample file</button>
      </div>
      <p className="hint">Needs at least {MIN_DAYS} days. Columns are found by name: Date, Resting Heart Rate, Minutes Asleep or Sleep Hours.</p>

      {parsed && (
        <>
          {parsed.warnings.length > 0 && <ul className="imp-warn" role="status">{parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          {parsed.days > 0 && (
            <p className="hint">
              Read <strong>{parsed.days} days</strong> from {name || 'the file'}. Date: “{parsed.detected.date}”, heart rate: “{parsed.detected.heartRate}”
              {parsed.detected.sleep ? `, sleep: “${parsed.detected.sleep}”` : ''}.
            </p>
          )}
          {parsed.days > 0 && parsed.days < MIN_DAYS && <p className="imp-warn">Only {parsed.days} days: AstroPulse needs about {MIN_DAYS} to learn a baseline and see a trend.</p>}
        </>
      )}

      {replay && hr && (
        <>
          <div className="rp-now">
            <div className="rp-card">
              <span className="rp-k">Your normal (first {BASELINE_DAYS} days)</span>
              <strong>{hrBase.length ? `${mean(hrBase).toFixed(0)} bpm resting` : 'not enough data'}</strong>
              <small>Fixed ranges call 60 to 100 bpm normal for everyone.</small>
            </div>
            <div className="rp-card">
              <span className="rp-k">Fixed ranges say</span>
              <strong>{fixedFlagged} of {replay.days.length} days outside the range</strong>
              <small>{fixedFlagged > replay.days.length / 2 ? 'Your normal sits outside the range, so it flags you almost every day.' : 'Where your numbers left the fixed range.'}</small>
            </div>
            <div className="rp-card">
              <span className="rp-k">Personal baseline says</span>
              <strong>{hr.modelAlarm == null ? 'No sustained drift' : `Drift flagged on day ${hr.modelAlarm + 1}`}</strong>
              <small>{hr.modelAlarm == null ? 'Nothing moved away from your own normal for four days in a row.' : 'Four days in a row, at least 2σ from your own first week.'}</small>
            </div>
          </div>
          <ReplayGrid replay={replay} day={last} />
          <p className="hint">
            A pattern to look at, not a diagnosis. Sleep and many things (travel, a hard week, a cold) move these numbers. This is a prototype and not a medical device.
          </p>
        </>
      )}
    </section>
  )
}
