import { useEffect, useMemo, useRef, useState } from 'react'
import BodyFigure from './BodyFigure.jsx'
import OrganPanel from './OrganPanel.jsx'
import { allOrganStatuses, changedOrgans } from './organs.js'
import { fetchStatus, loadDashboard } from '../dashboard/load.js'
import { COLOR_NAMES } from '../dashboard/metricInfo.js'

const POLL_MS = 3000 // until live push (a5) exists, ask the server every few seconds
const PULSE_MS = 1000

export default function BodyView() {
  const [status, setStatus] = useState(null)
  const [mode, setMode] = useState('live')
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState(null)
  const [pulsing, setPulsing] = useState(() => new Set())
  const previous = useRef(null)
  const pulseTimer = useRef(null)

  useEffect(() => {
    let cancelled = false
    loadDashboard()
      .then(d => {
        if (cancelled) return
        previous.current = d.status
        setStatus(d.status)
        setMode(d.mode)
      })
      .catch(() => !cancelled && setFailed(true))

    const timer = setInterval(async () => {
      if (document.hidden) return
      const next = await fetchStatus()
      if (cancelled || !next) return
      const hit = changedOrgans(previous.current, next)
      previous.current = next
      setStatus(next)
      setMode('live')
      if (hit.length > 0) {
        setPulsing(new Set(hit))
        clearTimeout(pulseTimer.current)
        pulseTimer.current = setTimeout(() => setPulsing(new Set()), PULSE_MS)
      }
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
      clearTimeout(pulseTimer.current)
    }
  }, [])

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
        {mode === 'live'
          ? `Live · refreshes every ${POLL_MS / 1000} s`
          : 'The server could not be reached, so this is sample data from the mission simulation.'}
      </p>

      <div className="body-layout">
        <div className="body-figure">
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
        <OrganPanel organ={current} />
      </div>
    </section>
  )
}
