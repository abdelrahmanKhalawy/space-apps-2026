import { useEffect, useMemo, useRef, useState } from 'react'
import BodyFigure from './BodyFigure.jsx'
import OrganPanel from './OrganPanel.jsx'
import { allOrganStatuses, changedOrgans } from './organs.js'
import { fetchStatus, loadDashboard } from '../dashboard/load.js'
import { COLOR_NAMES } from '../dashboard/metricInfo.js'

const PULSE_MS = 1000

// reloadKey: bumped by useLive() (a5) on every live reading, or every 2s if the
// SignalR hub couldn't connect — either way, this component doesn't poll on its own.
export default function BodyView({ reloadKey = 0 }) {
  const [status, setStatus] = useState(null)
  const [explain, setExplain] = useState({})
  const [forecast, setForecast] = useState({})
  const [mode, setMode] = useState('live')
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState(null)
  const [pulsing, setPulsing] = useState(() => new Set())
  const previous = useRef(null)
  const pulseTimer = useRef(null)
  const first = useRef(true)

  useEffect(() => {
    let cancelled = false

    const load = reloadKey === 0 || first.current ? loadDashboard() : null

    if (load) {
      first.current = false
      load
        .then(d => {
          if (cancelled) return
          previous.current = d.status
          setStatus(d.status)
          setExplain(d.explain ?? {})
          setForecast(d.forecast ?? {})
          setMode(d.mode)
        })
        .catch(() => !cancelled && setFailed(true))
      return () => {
        cancelled = true
      }
    }

    // Live tick: just the status, so a fast run of readings stays cheap.
    fetchStatus().then(next => {
      if (cancelled || !next) return
      const hit = changedOrgans(previous.current, next)
      previous.current = next
      setStatus(next)
      setMode('live')
      if (hit.length > 0) {
        setPulsing(new Set(hit))
        clearTimeout(pulseTimer.current)
        pulseTimer.current = setTimeout(() => !cancelled && setPulsing(new Set()), PULSE_MS)
      }
    })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  useEffect(() => () => clearTimeout(pulseTimer.current), [])

  const organs = useMemo(() => (status ? allOrganStatuses(status) : []), [status])

  if (failed) {
    return (
      <p className="banner-error" role="alert">
        Could not load the body view. Check the connection and reload the page.
      </p>
    )
  }
  if (!status) return <p className="hint" role="status">Loading your body status…</p>

  const current = organs.find(o => o.id === selected) ?? null

  return (
    <section className="body-view" data-testid="body-view">
      <p className={mode === 'live' ? 'live-note' : 'notice'} role="status">
        {mode === 'live' ? 'Live' : 'The server could not be reached, so this is sample data from the mission simulation.'}
      </p>

      <div className="body-layout">
        <div className="body-figure">
          <p className="panel-label">Body map · tap a part</p>
          <BodyFigure organs={organs} selected={selected} pulsing={pulsing} onSelect={id => setSelected(s => (s === id ? null : id))} />
          <ul className="organ-chips" aria-label="Body parts">
            {organs.map(o => (
              <li key={o.id}>
                <button
                  type="button"
                  className={`chip chip-${o.color ?? 'none'}${selected === o.id ? ' on' : ''}`}
                  aria-pressed={selected === o.id}
                  onClick={() => setSelected(s => (s === o.id ? null : o.id))}
                >
                  <span className="chip-dot" aria-hidden="true" />
                  {o.label}: {COLOR_NAMES[o.color] ?? 'No data'}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <OrganPanel organ={current} explainByMetric={explain} forecastByMetric={forecast} />
      </div>
    </section>
  )
}
