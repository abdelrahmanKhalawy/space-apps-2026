import { useState } from 'react'
import { BP, GLUCOSE, SLEEP, MOOD, METRIC_LABELS } from './metrics.js'
import { validate, buildReadings, stepSleep } from './readings.js'
import { queueReadings } from '../offline/outbox.js'

const EMPTY = { systolic: '', diastolic: '', glucose: '', sleep: null, mood: null }

function FieldError({ id, message }) {
  if (!message) return null
  return (
    <p id={id} className="field-error" role="alert">
      {message}
    </p>
  )
}

function formatTime(iso) {
  return iso ? `${iso.slice(11, 16)} UTC` : ''
}

// Server-side problems come back as { error, errors: [{ index, field, message }] }.
async function readProblem(res) {
  try {
    const body = await res.json()
    const lines = Array.isArray(body.errors) ? body.errors.map(e => e.message).filter(Boolean) : []
    return [body.error, ...lines].filter(Boolean).join(' ')
  } catch {
    return `The server had a problem (status ${res.status}). Nothing was saved. Try again.`
  }
}

export default function EntryForm() {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | sending | saved | failed
  const [saved, setSaved] = useState([])
  const [problem, setProblem] = useState('')

  const set = (key, value) => {
    setValues(v => ({ ...v, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined, form: undefined }))
    if (status !== 'sending') setStatus('idle')
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (status === 'sending') return

    const { errors: found, parsed } = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setStatus('sending')
    setProblem('')
    const readings = buildReadings(parsed)
    try {
      const res = await fetch('/api/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(readings),
      })
      if (!res.ok) {
        setProblem(await readProblem(res))
        setStatus('failed')
        return
      }
      setSaved(await res.json())
      setValues(EMPTY)
      setStatus('saved')
    } catch {
      // No connection: keep the reading on this device and send it when the link is back (offline/outbox.js).
      queueReadings(readings)
      setValues(EMPTY)
      setStatus('queued')
    }
  }

  return (
    <form className="entry" onSubmit={onSubmit} noValidate>
      <h2>Log a check</h2>
      <p className="hint">Fill in what you measured. Skip what you did not. It takes under a minute.</p>

      {status === 'saved' && (
        <section className="saved" role="status" aria-live="polite">
          <h3>Saved ✓</h3>
          <ul>
            {saved.map(r => (
              <li key={r.id ?? `${r.metric}-${r.takenAt}`}>
                {r.color && <span className={`dot dot-${r.color}`} aria-label={r.color} />}
                <span>{METRIC_LABELS[r.metric] ?? r.metric}</span>
                <strong>
                  {r.value} {r.unit === 'score' ? '/ 5' : r.unit}
                </strong>
              </li>
            ))}
          </ul>
          <small>Recorded at {formatTime(saved[0]?.takenAt)}</small>
        </section>
      )}

      {status === 'queued' && (
        <section className="saved" role="status" aria-live="polite">
          <h3>Saved on this device</h3>
          <p>There is no connection right now. Your reading is kept here and will be sent automatically when the link is back.</p>
        </section>
      )}

      {status === 'failed' && (
        <p className="banner-error" role="alert">
          {problem}
        </p>
      )}
      <FieldError id="form-error" message={errors.form} />

      <fieldset>
        <legend>Blood pressure</legend>
        <div className="row">
          <label>
            {BP.systolic.label}
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="120"
              value={values.systolic}
              onChange={e => set('systolic', e.target.value)}
              aria-invalid={Boolean(errors.systolic)}
              aria-describedby={errors.systolic ? 'err-systolic' : undefined}
            />
            <span className="unit">{BP.systolic.unit}</span>
          </label>
          <label>
            {BP.diastolic.label}
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="80"
              value={values.diastolic}
              onChange={e => set('diastolic', e.target.value)}
              aria-invalid={Boolean(errors.diastolic)}
              aria-describedby={errors.diastolic ? 'err-diastolic' : undefined}
            />
            <span className="unit">{BP.diastolic.unit}</span>
          </label>
        </div>
        <FieldError id="err-systolic" message={errors.systolic} />
        <FieldError id="err-diastolic" message={errors.diastolic} />
        <p className="field-hint">Sit still for 5 minutes, then measure.</p>
      </fieldset>

      <fieldset>
        <legend>{GLUCOSE.label}</legend>
        <label>
          <span className="sr-only">{GLUCOSE.label}</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="95"
            value={values.glucose}
            onChange={e => set('glucose', e.target.value)}
            aria-invalid={Boolean(errors.glucose)}
            aria-describedby={errors.glucose ? 'err-glucose' : undefined}
          />
          <span className="unit">{GLUCOSE.unit}</span>
        </label>
        <FieldError id="err-glucose" message={errors.glucose} />
        <p className="field-hint">Note when you last ate.</p>
      </fieldset>

      <fieldset>
        <legend>{SLEEP.label}</legend>
        <div className="stepper">
          <button type="button" onClick={() => set('sleep', stepSleep(values.sleep, -1))} aria-label="Half an hour less">
            −
          </button>
          <output aria-live="polite">
            {values.sleep === null ? '—' : values.sleep.toFixed(1)} <span className="unit">h</span>
          </output>
          <button type="button" onClick={() => set('sleep', stepSleep(values.sleep, 1))} aria-label="Half an hour more">
            +
          </button>
        </div>
        <FieldError id="err-sleep" message={errors.sleep} />
        <p className="field-hint">Hours you actually slept.</p>
      </fieldset>

      <fieldset>
        <legend>{MOOD.label}</legend>
        <div className="moods" role="radiogroup" aria-label={MOOD.label}>
          {MOOD.options.map(o => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={values.mood === o.value}
              aria-label={`${o.text} (${o.value} of 5)`}
              className={values.mood === o.value ? 'mood picked' : 'mood'}
              onClick={() => set('mood', values.mood === o.value ? null : o.value)}
            >
              <span aria-hidden="true">{o.emoji}</span>
            </button>
          ))}
        </div>
        <FieldError id="err-mood" message={errors.mood} />
      </fieldset>

      <button type="submit" className="send" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send readings'}
      </button>
    </form>
  )
}
