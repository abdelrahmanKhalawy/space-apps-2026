import { COLOR_NAMES, HAZARD_NAMES, METRIC_NAMES, unitLabel } from '../dashboard/metricInfo.js'
import { formatTime, formatValue } from '../dashboard/status.js'
import thresholds from '../dashboard/thresholds.js'

// Details for the part of the body the astronaut tapped: each indicator behind it, its color, and the advice.
export default function OrganPanel({ organ }) {
  if (!organ) {
    return (
      <div className="organ-panel organ-empty" data-testid="organ-panel">
        <p className="hint">Tap a part of the body to see its indicators.</p>
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
                <span className={`pill pill-${m.color ?? 'none'}`}>{COLOR_NAMES[m.color] ?? 'No range'}</span>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
