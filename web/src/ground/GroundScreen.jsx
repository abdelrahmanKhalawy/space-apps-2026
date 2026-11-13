import { useCallback, useEffect, useRef, useState } from 'react'
import { METRIC_NAMES } from '../dashboard/metricInfo.js'
import { MISSIONS, formatCountdown, formatDuration } from '../decision/mission.js'
import { clockTime, oneWaySeconds, progress, remainingSeconds, splitReports } from './reports.js'

const CREW_ID = 'crew-1'
const POLL_MS = 2000

const SEVERITY_LABEL = { red: 'RED', yellow: 'YELLOW', green: 'GREEN' }

async function post(url) {
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
}

/**
 * The flight surgeon's screen, at #ground. Reports from the crew appear here only after their signal delay:
 * until then each one is a countdown with no content. Looks different from the crew screen on purpose.
 */
export default function GroundScreen() {
  const [data, setData] = useState(null) // { reports, fetchedAt }
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const latest = useRef(null)
  const loading = useRef(false)

  const load = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    try {
      const res = await fetch(`/api/reports?crewId=${CREW_ID}`)
      if (!res.ok) throw new Error(`answered ${res.status}`)
      const next = { reports: await res.json(), fetchedAt: Date.now() }
      latest.current = next
      setData(next)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      loading.current = false
    }
  }, [])

  useEffect(() => {
    load()
    const poll = setInterval(load, POLL_MS)
    const tick = setInterval(() => {
      const t = Date.now()
      setNow(t)
      // A countdown just hit zero: ask the server right away instead of waiting for the next poll.
      const cur = latest.current
      if (cur && cur.reports.some(r => r.status === 'in_transit' && remainingSeconds(r, cur.fetchedAt, t) <= 0)) load()
    }, 1000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [load])

  async function demo(url) {
    setBusy(true)
    try {
      await post(url)
      await load()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const { arrived, inTransit } = data ? splitReports(data.reports) : { arrived: [], inTransit: [] }

  return (
    <div className="ground">
      <header className="gr-top">
        <div>
          <p className="gr-brand">AstroPulse · Ground Control</p>
          <h1>Flight surgeon console</h1>
        </div>
        <a className="gr-link" href="#status">
          Open crew screen
        </a>
      </header>

      <main className="gr-main">
        <p className="gr-sub">
          Crew <strong>{CREW_ID}</strong> · {arrived.length} received · {inTransit.length} in transit
        </p>

        {failed && (
          <p className="gr-error" role="alert">
            Cannot reach the server. Showing the last reports received.
          </p>
        )}
        {!data && !failed && <p className="gr-empty" role="status">Listening for the crew…</p>}

        {data && data.reports.length === 0 && (
          <p className="gr-empty" data-testid="ground-empty">
            No reports yet. When the crew sends one it appears here after the signal delay.
          </p>
        )}

        <ul className="gr-list" data-testid="ground-list">
          {inTransit.map(r => {
            const left = remainingSeconds(r, data.fetchedAt, now)
            return (
              <li key={r.id} className="gr-card gr-transit" data-testid={`report-${r.id}`} data-status="in_transit">
                <div className="gr-card-head">
                  <h2>Signal in transit from {MISSIONS[r.mission]?.label ?? r.mission}</h2>
                  <span className="gr-chip gr-chip-wait">In transit</span>
                </div>
                <p className="gr-count" aria-live="off">
                  Arrives in <strong>{formatCountdown(left)}</strong>
                </p>
                <div className="gr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress(r, left) * 100)}>
                  <span style={{ width: `${progress(r, left) * 100}%` }} />
                </div>
                <p className="gr-note">
                  Sent {clockTime(r.sentAt)}. The report cannot be read until it arrives.
                </p>
              </li>
            )
          })}

          {arrived.map(r => (
            <li key={r.id} className={`gr-card gr-${r.severity}`} data-testid={`report-${r.id}`} data-status="arrived">
              <div className="gr-card-head">
                <h2>Report from {MISSIONS[r.mission]?.label ?? r.mission}</h2>
                <span className={`gr-chip gr-chip-${r.severity}`}>{SEVERITY_LABEL[r.severity] ?? r.severity}</span>
              </div>
              <p className="gr-summary">{r.summary}</p>
              {r.metrics.length > 0 && (
                <ul className="gr-tags" aria-label="Indicators in this report">
                  {r.metrics.map(m => (
                    <li key={m}>{METRIC_NAMES[m] ?? m}</li>
                  ))}
                </ul>
              )}
              <p className="gr-note">
                Received {clockTime(r.deliverAt)} · sent {clockTime(r.sentAt)} · delay {formatDuration(oneWaySeconds(r))} one way ·
                earliest reply from the crew's view {clockTime(r.replyEarliestAt)}
              </p>
            </li>
          ))}
        </ul>

        <section className="gr-demo" aria-label="Demo controls">
          <h2>Demo controls</h2>
          <p>Only for presenting. They move the report clock forward so a long delay does not stall the demo.</p>
          <div className="gr-demo-buttons">
            <button type="button" disabled={busy || inTransit.length === 0} onClick={() => demo('/api/demo/fast-forward')}>
              Skip to next arrival
            </button>
            <button type="button" className="gr-secondary" disabled={busy} onClick={() => demo('/api/demo/reset')}>
              Reset demo clock
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
