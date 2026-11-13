import { useEffect, useState } from 'react'
import { METRIC_NAMES, unitLabel } from './metricInfo.js'
import { chartBands, chartDomain, formatTime, formatValue, niceTicks } from './status.js'

// A small hand-drawn SVG line chart: the colored bands from research/thresholds.json sit behind the line,
// so a slow slide from green into yellow is easy to see. No chart library, so nothing extra to load.

const M = { top: 10, right: 14, bottom: 26, left: 46 }

// Phones get a squarer chart so it stays tall enough to read, and the text stays a readable size.
function useNarrow() {
  const query = '(max-width: 520px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}
const BAND_FILL = { green: '#3ddc84', yellow: '#ffcc4d', red: '#ff5d5d' }

const isoOf = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
const dayLabel = ms => {
  const d = new Date(ms)
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`
}

export default function MetricChart({ metric, readings, threshold }) {
  const [hover, setHover] = useState(null)
  const narrow = useNarrow()
  const W = narrow ? 360 : 640
  const H = narrow ? 270 : 250

  const points = readings.map(r => ({ t: Date.parse(r.takenAt), value: r.value }))
  if (points.length === 0) return <p className="hint">No readings for this indicator yet.</p>

  const unit = unitLabel(readings[0].unit ?? threshold?.unit ?? '')
  const domain = chartDomain(threshold, points.map(p => p.value))
  const bands = chartBands(threshold, domain)
  const [lo, hi] = domain
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const span = t1 - t0 || 1

  const x = t => M.left + ((t - t0) / span) * (W - M.left - M.right)
  const y = v => M.top + (1 - (v - lo) / (hi - lo || 1)) * (H - M.top - M.bottom)

  const yTicks = niceTicks(lo, hi, 5)
  const xTicks = Array.from({ length: 5 }, (_, i) => t0 + (span * i) / 4)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  const last = points[points.length - 1]
  const shown = hover ?? last
  const days = Math.max(1, Math.round(span / 86400000))

  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    let best = points[0]
    for (const p of points) if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p
    setHover(best)
  }

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        role="img"
        aria-label={`${METRIC_NAMES[metric] ?? metric} over the last ${days} days. Latest ${formatValue(metric, last.value)} ${unit}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {bands.map((b, i) => (
          <rect
            key={i}
            x={M.left}
            width={W - M.left - M.right}
            y={y(b.y2)}
            height={Math.max(0, y(b.y1) - y(b.y2))}
            fill={BAND_FILL[b.color]}
            opacity="0.16"
          />
        ))}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="#2a3563" strokeDasharray="3 3" />
            <text x={M.left - 6} y={y(v) + 4} textAnchor="end" fill="#9aa6d6" fontSize="11">
              {formatValue(metric, v)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} fill="#9aa6d6" fontSize="11">
            {dayLabel(t)}
          </text>
        ))}
        <path d={line} fill="none" stroke="#e8ecff" strokeWidth="2" strokeLinejoin="round" />
        {points.length <= 30 && points.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.value)} r="3" fill="#e8ecff" />)}
        {hover && (
          <g>
            <line x1={x(hover.t)} x2={x(hover.t)} y1={M.top} y2={H - M.bottom} stroke="#6ea8ff" />
            <circle cx={x(hover.t)} cy={y(hover.value)} r="5" fill="#6ea8ff" />
          </g>
        )}
      </svg>
      <p className="chart-readout" aria-live="polite">
        <strong>
          {formatValue(metric, shown.value)} {unit}
        </strong>{' '}
        · {formatTime(isoOf(shown.t))}
      </p>
      <p className="chart-legend">
        <span className="swatch swatch-green" /> Green <span className="swatch swatch-yellow" /> Yellow{' '}
        <span className="swatch swatch-red" /> Red · last {days} days
      </p>
    </div>
  )
}
