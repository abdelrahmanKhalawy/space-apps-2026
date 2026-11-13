import { HAZARD_NAMES, METRIC_NAMES } from './metricInfo.js'

// i4: "if this keeps up, it'll be red in N days" — the line the demo script calls out
// as its strongest moment. Only present for metrics actually trending toward red.
function ForecastLine({ forecast }) {
  if (!forecast) return null
  const days = forecast.daysToRed
  const when = days < 1 ? 'less than a day' : days === 1 ? '1 day' : `${days} days`
  return (
    <p className="card-forecast">
      <span className="tag tag-forecast">Forecast</span>
      If this keeps up, red in about <strong>{when}</strong>
      <span className="card-forecast-confidence"> · {forecast.confidence} confidence</span>
    </p>
  )
}

// i3: the model flagged this metric as a real drift, not just a single reading — "why"
// comes from Nada's sourced text (research/explanations.json), word for word.
// Shared by the dashboard's MetricCard and the interactive body's OrganPanel, so
// tapping an organ shows the same model reasoning a dashboard card would.
export default function WhyThisMatters({ explain, forecast, color }) {
  // A forecast says where a value is headed — showing it once the card is already
  // red is just stating the obvious, so it only renders before that point.
  const showForecast = forecast && color !== 'red'
  if (!explain && !showForecast) return null
  return (
    <div className="card-why" onClick={e => e.stopPropagation()}>
      {showForecast && <ForecastLine forecast={forecast} />}
      {explain && (
        <>
          <p className="card-why-head">
            <span className="tag tag-model">Model flagged this</span>
            {HAZARD_NAMES[explain.hazard] ?? explain.hazard}
          </p>
          <p>{explain.explanation}</p>
          <ul>
            {explain.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          {explain.relatedMetrics?.length > 0 && (
            <p className="card-why-related">
              Linked to: {explain.relatedMetrics.map(m => METRIC_NAMES[m] ?? m).join(', ')}
            </p>
          )}
          <p className="card-why-sources">
            {explain.sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            ))}
          </p>
        </>
      )}
    </div>
  )
}
