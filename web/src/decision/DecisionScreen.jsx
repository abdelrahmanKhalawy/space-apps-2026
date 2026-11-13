import { useEffect, useState } from 'react'
import { HAZARD_NAMES, METRIC_NAMES, unitLabel } from '../dashboard/metricInfo.js'
import { formatValue } from '../dashboard/status.js'
import {
  DEFAULT_MISSION,
  MISSIONS,
  buildReport,
  formatCountdown,
  formatDuration,
  localTimes,
  roundTripSeconds,
  shouldWaitForEarth,
  splitSteps,
} from './mission.js'

const STORAGE_KEY = 'astropulse.mission'

function readMission() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved && MISSIONS[saved] ? saved : DEFAULT_MISSION
  } catch {
    return DEFAULT_MISSION
  }
}

/**
 * Shown on top of the dashboard whenever any indicator is red:
 * what is wrong, what to do right now, how long Earth needs to answer, and a button to report.
 * Steps come from the red advice in research/thresholds.json (through /api/status), not from this file.
 */
export default function DecisionScreen({ status, units }) {
  const reds = status.metrics.filter(m => m.color === 'red')
  const [mission, setMission] = useState(readMission)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null) // { id?, sentAt, deliverAt, replyEarliestAt, queued }
  const [now, setNow] = useState(() => Date.now())

  const chooseMission = id => {
    setMission(id)
    setSent(null)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* private mode: the choice just will not be remembered */
    }
  }

  useEffect(() => {
    if (!sent) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [sent])

  if (reds.length === 0) return null

  const roundTrip = roundTripSeconds(mission)
  const canWait = shouldWaitForEarth(mission)

  async function report() {
    if (sending) return
    setSending(true)
    const body = buildReport({
      crewId: status.crewId,
      mission,
      reds,
      namer: m => METRIC_NAMES[m] ?? m,
      formatValueFn: (m, v) => `${formatValue(m, v)} ${unitLabel(units[m] ?? '')}`.trim(),
    })
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = res.ok ? await res.json().catch(() => null) : null
      if (data && data.deliverAt && data.replyEarliestAt) {
        setSent({ ...data, queued: false })
      } else {
        // The ground station endpoint is not there yet (a6). Keep the report on this screen, say so plainly.
        setSent({ ...localTimes(mission), queued: true })
      }
    } catch {
      setSent({ ...localTimes(mission), queued: true })
    }
    setNow(Date.now())
    setSending(false)
  }

  const replyIn = sent ? (Date.parse(sent.replyEarliestAt) - now) / 1000 : 0

  return (
    <section className="decision" role="alert" aria-labelledby="decision-title" data-testid="decision">
      <h2 id="decision-title">Decision needed now</h2>

      <div className={canWait ? 'delay delay-ok' : 'delay delay-act'} data-testid="delay">
        <div className="delay-top">
          <span className="delay-label">Earth can answer in about</span>
          <strong className="delay-time">{formatDuration(roundTrip)}</strong>
          <span className="delay-label">round trip from {MISSIONS[mission].label}</span>
        </div>
        <p className="delay-verdict">
          {canWait
            ? 'Earth can reply quickly. Report now and wait for their answer.'
            : "Don't wait for Earth. Act now with the steps below, then report."}
        </p>
        <div className="missions" role="radiogroup" aria-label="Mission location">
          {Object.entries(MISSIONS).map(([id, m]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mission === id}
              className={mission === id ? 'mission on' : 'mission'}
              onClick={() => chooseMission(id)}
            >
              {m.short}
            </button>
          ))}
        </div>
      </div>

      <ul className="problems">
        {reds.map(m => (
          <li key={m.metric} className="problem" data-testid={`problem-${m.metric}`}>
            <h3>
              {METRIC_NAMES[m.metric] ?? m.metric}: {formatValue(m.metric, m.value)} {unitLabel(units[m.metric] ?? '')}
              <span className="pill pill-red">Red</span>
            </h3>
            {m.hazard && <p className="why">Linked hazard: {HAZARD_NAMES[m.hazard] ?? m.hazard}</p>}
            <ol className="steps" dir="auto">
              {splitSteps(m.advice).map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </li>
        ))}
      </ul>

      {sent && sent.queued ? (
        <div className="sent sent-failed" role="alert" aria-live="assertive" data-testid="sent">
          <strong>Report not sent</strong>
          <span className="queued-note">Could not reach the server, so nothing reached Earth. Nothing was retried automatically.</span>
          <button type="button" className="report" onClick={report} disabled={sending}>
            {sending ? 'Sending…' : 'Try again'}
          </button>
        </div>
      ) : sent ? (
        <div className="sent" role="status" aria-live="polite" data-testid="sent">
          <strong>Report sent to Earth</strong>
          <span>
            Reply possible in <b>{formatCountdown(replyIn)}</b>
          </span>
        </div>
      ) : (
        <button type="button" className="report" onClick={report} disabled={sending}>
          {sending ? 'Sending…' : 'Report to Earth'}
        </button>
      )}
    </section>
  )
}
