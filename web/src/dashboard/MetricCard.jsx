import { Suspense, lazy } from 'react'
import { COLOR_NAMES, HAZARD_NAMES, METRIC_NAMES, unitLabel } from './metricInfo.js'
import { formatTime, formatValue } from './status.js'
import WhyThisMatters from './WhyThisMatters.jsx'
import EvidenceBadges from './EvidenceBadges.jsx'

// The chart library is loaded the first time someone opens a card, so the cards appear fast.
const MetricChart = lazy(() => import('./MetricChart.jsx'))

export default function MetricCard({ item, unit, readings, threshold, explain, forecast, open, onToggle }) {
  const color = item.color ?? 'none'
  return (
    <article
      className={`card card-${color}${open ? ' card-open' : ''}`}
      data-testid={`card-${item.metric}`}
      onClick={onToggle}
    >
      <button type="button" className="card-head" aria-expanded={open} aria-controls={`chart-${item.metric}`}>
        <span className="card-name">{METRIC_NAMES[item.metric] ?? item.metric}</span>
        <span className="card-value">
          {formatValue(item.metric, item.value)} <small>{unitLabel(unit)}</small>
        </span>
        <span className={`pill pill-${color}`}>{COLOR_NAMES[item.color] ?? 'No range'}</span>
      </button>

      {item.advice && (
        <p className="card-advice" dir="auto">
          {item.advice}
        </p>
      )}
      <p className="card-meta">
        {item.hazard && <span className="tag">{HAZARD_NAMES[item.hazard] ?? item.hazard}</span>}
        <span>{formatTime(item.takenAt)}</span>
        <span className="open-hint">{open ? 'Hide chart' : 'Show chart'}</span>
      </p>

      {open && (
        <div id={`chart-${item.metric}`} onClick={e => e.stopPropagation()}>
          <Suspense fallback={<p className="hint">Loading chart…</p>}>
            <MetricChart metric={item.metric} readings={readings} threshold={threshold} />
          </Suspense>
          <WhyThisMatters explain={explain} forecast={forecast} color={color} />
          <EvidenceBadges metric={item.metric} />
        </div>
      )}
    </article>
  )
}
