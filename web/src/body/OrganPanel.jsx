import { COLOR_NAMES, HAZARD_NAMES, METRIC_NAMES, STATUS_WORDS, unitLabel } from '../dashboard/metricInfo.js'
import { formatTime, formatValue } from '../dashboard/status.js'
import thresholds from '../dashboard/thresholds.js'
import WhyThisMatters from '../dashboard/WhyThisMatters.jsx'

// Details for the part of the body the astronaut tapped: each indicator behind it, its color, and the advice.
// explainByMetric/forecastByMetric: same live model data the dashboard cards show (i3/i4) — tapping an organ
// is "the dose on the organ opens its explanation" (a8's brief), and that explanation is the model's, not
// just the short threshold advice every reading already carries.
export default function OrganPanel({ organ, organs = [], onSelect = () => {}, explainByMetric = {}, forecastByMetric = {} }) {
  if (!organ) {
    // Nothing picked yet: a quick overview of every part, worst first, so the panel is never an empty box.
    const rank = { red: 0, yellow: 1, green: 2 }
    const sorted = [...organs].sort((a, b) => (rank[a.color] ?? 3) - (rank[b.color] ?? 3))
    return (
      <div className="organ-panel" data-testid="organ-panel">
        <p className="panel-label">Overview · tap a part to zoom in</p>
        <ul className="overview">
          {sorted.map(o => (
            <li key={o.id}>
              <button type="button" className={`overview-row card-${o.color ?? 'none'}`} onClick={() => onSelect(o.id)}>
                <span className="overview-name">{o.label}</span>
                <span className="overview-values">
                  {o.items.length === 0
                    ? 'No readings yet'
                    : o.items.map(m => `${formatValue(m.metric, m.value)} ${unitLabel(thresholds[m.metric]?.unit ?? '')}`.trim()).join(' · ')}
                </span>
                <span className={`pill pill-${o.color ?? 'none'}`}>{STATUS_WORDS[o.color] ?? 'No range'}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="organ-panel" data-testid="organ-panel" aria-live="polite">
      <h2>
        {organ.label}
        <span className={`pill pill-${organ.color ?? 'none'}`}>{COLOR_NAMES[organ.color] ?? 'No readings'}</span>
      </h2>

      {organ.items.length === 0 ? (
        <p className="hint">No readings for this part yet. Add one in the Log tab.</p>
      ) : (
        <ul className="organ-metrics">
          {organ.items.map(m => (
            <li key={m.metric} className={`organ-metric card-${m.color ?? 'none'}`} data-testid={`organ-metric-${m.metric}`}>
              <div className="organ-metric-head">
                <span className="card-name">{METRIC_NAMES[m.metric] ?? m.metric}</span>
                <span className={`pill pill-${m.color ?? 'none'}`}>{STATUS_WORDS[m.color] ?? 'No range'}</span>
              </div>
              <div className="card-value">
                {formatValue(m.metric, m.value)} <small>{unitLabel(thresholds[m.metric]?.unit ?? '')}</small>
              </div>
              {m.advice && (
                <p className="card-advice" dir="auto">
                  {m.advice}
                </p>
              )}
              <p className="card-meta">
                {m.hazard && <span className="tag">{HAZARD_NAMES[m.hazard] ?? m.hazard}</span>}
                <span>{formatTime(m.takenAt)}</span>
              </p>
              <WhyThisMatters explain={explainByMetric[m.metric]} forecast={forecastByMetric[m.metric]} color={m.color} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
