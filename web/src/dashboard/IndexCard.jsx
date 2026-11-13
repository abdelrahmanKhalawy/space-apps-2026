import { useMemo } from 'react'
import { computeIndex } from './astroIndex.js'
import { METRIC_NAMES } from './metricInfo.js'

const TONE_COLOR = { green: '#3ddc84', yellow: '#ffcc4d', orange: '#ff9f43', red: '#ff5d5d' }

function why(p) {
  if (p.z != null && p.personal > 0) {
    const dir = p.z > 0 ? 'above' : 'below'
    return Math.abs(p.z) > 6 ? `far ${dir} your own normal` : `${Math.abs(p.z).toFixed(1)}σ ${dir} your own normal`
  }
  return p.color === 'red' ? 'in the red zone' : 'outside the usual range'
}

/** AstroPulse Index: one 0-100 number for how far you are from your own normal. */
export default function IndexCard({ readings, thresholds }) {
  const idx = useMemo(() => computeIndex(readings, thresholds), [readings, thresholds])
  const tone = TONE_COLOR[idx.label.tone]
  const R = 34
  const C = 2 * Math.PI * R
  const drivers = idx.parts.filter(p => p.strain > 0.05).slice(0, 3)
  return (
    <section className="idx" aria-label="AstroPulse Index">
      <svg viewBox="0 0 90 90" className="idx-ring" role="img" aria-label={`AstroPulse Index ${idx.score} out of 100, ${idx.label.label}`}>
        <circle cx="45" cy="45" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle cx="45" cy="45" r={R} fill="none" stroke={tone} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(idx.score / 100) * C} ${C}`} transform="rotate(-90 45 45)" />
        <text x="45" y="51" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--text)">{idx.score}</text>
      </svg>
      <div className="idx-body">
        <h3 className="idx-title">AstroPulse Index · <span style={{ color: tone }}>{idx.label.label}</span></h3>
        {drivers.length > 0 ? (
          <ul className="idx-drivers">
            {drivers.map(p => (
              <li key={p.metric}><strong>{METRIC_NAMES[p.metric] ?? p.metric}</strong> {why(p)}</li>
            ))}
          </ul>
        ) : (
          <p className="idx-note">Everything is close to your own normal.</p>
        )}
        {!idx.baselineReady && <p className="idx-note">Still learning your normal. It needs about 9 days of readings.</p>}
        <p className="idx-fine">Our own composite score, a prototype. Not a validated clinical score.</p>
      </div>
    </section>
  )
}
