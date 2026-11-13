import { useEffect, useMemo, useState } from 'react'
import DecisionScreen from '../decision/DecisionScreen.jsx'
import MetricCard from './MetricCard.jsx'
import { loadDashboard } from './load.js'
import thresholds from './thresholds.js'
import { COLOR_NAMES, METRIC_ORDER } from './metricInfo.js'
import { groupByMetric, summarize } from './status.js'

export default function Dashboard({ reloadKey = 0 }) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [openMetric, setOpenMetric] = useState(null)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    loadDashboard()
      .then(d => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const byMetric = useMemo(() => (data ? groupByMetric(data.readings) : {}), [data])

  if (failed) {
    return (
      <p className="banner-error" role="alert">
        Could not load the dashboard. Check the connection and reload the page.
      </p>
    )
  }
  if (!data) return <p className="hint" role="status">Loading your status…</p>

  const { status, mode } = data
  const items = [...status.metrics].sort((a, b) => METRIC_ORDER.indexOf(a.metric) - METRIC_ORDER.indexOf(b.metric))
  const units = Object.fromEntries(
    items.map(i => [i.metric, byMetric[i.metric]?.[0]?.unit ?? thresholds[i.metric]?.unit ?? '']),
  )

  return (
    <section className="dashboard">
      <DecisionScreen status={status} units={units} />
      <div className={`banner banner-${status.overall ?? 'none'}`} role="status" data-testid="overall">
        <strong>Overall: {COLOR_NAMES[status.overall] ?? 'No data'}</strong>
        <span>{summarize(status)}</span>
      </div>
      {mode === 'sample' && (
        <p className="notice" role="note">
          The server could not be reached, so this is sample data from the mission simulation.
        </p>
      )}

      {items.length === 0 ? (
        <p className="hint">No readings yet. Use the Log tab to add your first check.</p>
      ) : (
        <div className="cards">
          {items.map(item => (
            <MetricCard
              key={item.metric}
              item={item}
              unit={byMetric[item.metric]?.[0]?.unit ?? thresholds[item.metric]?.unit ?? ''}
              readings={byMetric[item.metric] ?? []}
              threshold={thresholds[item.metric]}
              open={openMetric === item.metric}
              onToggle={() => setOpenMetric(m => (m === item.metric ? null : item.metric))}
            />
          ))}
        </div>
      )}
    </section>
  )
}
