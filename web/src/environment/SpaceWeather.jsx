import { useEffect, useState } from 'react'

// Radiation is NASA's first spaceflight hazard and no vital sign shows it, so this card shows the
// real environment: NOAA's Space Weather Prediction Center, read by GET /api/space-weather.
// "Preview a solar storm" asks the server for a SIMULATED storm and labels it as simulated.

const fmtFlux = f => (f == null ? '—' : f >= 100 ? Math.round(f).toString() : f.toFixed(2))
const fmtTime = iso => (iso ? `${iso.slice(11, 16)} UTC` : '')

function Source({ w }) {
  if (w.simulated) return <span className="tag tag-sim">Simulated, not real</span>
  if (w.source === 'snapshot') return <span className="tag">Recorded NOAA reading</span>
  return <span className="tag tag-live">NOAA SWPC · live · {fmtTime(w.observedAt)}</span>
}

export default function SpaceWeather() {
  const [w, setW] = useState(null)
  const [simulated, setSimulated] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    fetch(`/api/space-weather${simulated ? '?scenario=storm' : ''}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => !cancelled && setW(d))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [simulated])

  if (failed && !w) return null // the card is extra context: no server, no card, and nothing else breaks
  if (!w) return null

  return (
    <section className={`spw spw-${w.level}`} aria-label="Space weather">
      <div className="spw-head">
        <strong>{w.headline}</strong>
        <Source w={w} />
      </div>
      <p className="spw-detail">{w.detail}</p>
      <dl className="spw-stats">
        <div><dt>Solar radiation scale</dt><dd>S{w.sScale}</dd></div>
        <div><dt>Protons ≥10 MeV</dt><dd>{fmtFlux(w.protonFlux10MeV)} <small>pfu</small></dd></div>
        <div><dt>Geomagnetic Kp</dt><dd>{w.kp == null ? '—' : w.kp.toFixed(1)}</dd></div>
        <div><dt>Solar wind</dt><dd>{w.solarWindKmS == null ? '—' : Math.round(w.solarWindKmS)} <small>km/s</small></dd></div>
      </dl>
      {w.nasa && !w.simulated && (
        <p className="spw-nasa">
          <span className="tag">NASA DONKI</span>{' '}
          {w.nasa.flaresLast7Days === 0 ? 'No solar flares in the last 7 days' : `${w.nasa.flaresLast7Days} solar flare${w.nasa.flaresLast7Days === 1 ? '' : 's'} in 7 days (strongest ${w.nasa.strongestFlareClass})`}
          {' · '}
          {w.nasa.solarParticleEventsLast30Days === 0 ? 'no solar particle events in 30 days' : `${w.nasa.solarParticleEventsLast30Days} solar particle event${w.nasa.solarParticleEventsLast30Days === 1 ? '' : 's'} in 30 days`}
          {w.nasa.maxKpLast30Days != null ? ` · strongest geomagnetic storm Kp ${w.nasa.maxKpLast30Days.toFixed(1)}` : ''}
        </p>
      )}
      {w.level !== 'calm' && (
        <p className="hint">Radiation can't be felt, and your vitals won't show it. This alert comes from the space environment, not from your body.</p>
      )}
      <button type="button" className="cam-link" onClick={() => setSimulated(s => !s)}>
        {simulated ? 'Back to live space weather' : 'Preview a simulated solar storm'}
      </button>
    </section>
  )
}
