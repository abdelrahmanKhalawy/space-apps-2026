import { useEffect, useMemo, useState } from 'react'
import DecisionScreen from '../decision/DecisionScreen.jsx'
import EarthReply from '../decision/EarthReply.jsx'
import MetricCard from './MetricCard.jsx'
import IndexCard from './IndexCard.jsx'
import PrivacyPanel from '../privacy/PrivacyPanel.jsx'
import ReportSheet from '../report/ReportSheet.jsx'
import SpaceWeather from '../environment/SpaceWeather.jsx'
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
      <div className={`banner banner-${status.overall ?? 'none'}`} role="status" data-testid="overall">
        <span className="banner-icon" aria-hidden="true">
          {status.overall === 'green' ? '✓' : '!'}
        </span>
        <div>
          <strong>Overall: {COLOR_NAMES[status.overall] ?? 'No data'}</strong>
          <span>{summarize(status)}</span>
        </div>
      </div>
      <DecisionScreen status={status} units={units} />
      <EarthReply />
      <IndexCard readings={data.readings} thresholds={thresholds} />
      <SpaceWeather />
      {mode === 'sample' && (
        <p className="notice" role="note">
          The server could not be reached, so this is sample data from the mission simulation.
        </p>
      )}

      {items.length === 0 ? (
        <p className="hint">No readings yet. Use the Log tab to add your first check.</p>
      ) : (
        <>
        <div className="section-head">
          <h2>Indicators</h2>
          <span>Tap a card for details</span>
        </div>
        <div className="cards">
          {items.map(item => (
            <MetricCard
              key={item.metric}
              item={item}
              source={byMetric[item.metric]?.at(-1)?.source}
              unit={byMetric[item.metric]?.[0]?.unit ?? thresholds[item.metric]?.unit ?? ''}
              readings={byMetric[item.metric] ?? []}
              threshold={thresholds[item.metric]}
              explain={data.explain?.[item.metric]}
              forecast={data.forecast?.[item.metric]}
              open={openMetric === item.metric}
              onToggle={() => setOpenMetric(m => (m === item.metric ? null : item.metric))}
            />
          ))}
        </div>
        </>
      )}
      <div className="share">
        <PrivacyPanel />
        <button type="button" className="cam-link print-btn" onClick={() => window.print()}>Print a summary for the flight surgeon</button>
      </div>
      <ReportSheet status={status} readings={data.readings} thresholds={thresholds} explain={data.explain} forecast={data.forecast} />
    </section>
  )
}
