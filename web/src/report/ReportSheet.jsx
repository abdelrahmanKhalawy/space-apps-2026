import { useMemo } from 'react'
import { computeIndex } from '../dashboard/astroIndex.js'
import { COLOR_NAMES, METRIC_NAMES, unitLabel } from '../dashboard/metricInfo.js'
import { formatValue } from '../dashboard/status.js'
import { isShared, loadConsent } from '../privacy/consent.js'

/** One printable page for the flight surgeon. Hidden on screen, shown when printing (see styles.css). */
export default function ReportSheet({ status, readings, thresholds, explain = {}, forecast = {} }) {
  const consent = useMemo(loadConsent, [])
  const idx = useMemo(() => computeIndex(readings.filter(r => isShared(r.metric, consent)), thresholds), [readings, thresholds, consent])
  const rows = status.metrics.filter(m => isShared(m.metric, consent))
  const withheld = status.metrics.length - rows.length
  const generated = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  return (
    <section className="report-sheet" aria-hidden="true">
      <h1>AstroPulse · crew health summary</h1>
      <p>Crew <strong>{status.crewId}</strong> · generated {generated}</p>
      <p>AstroPulse Index: <strong>{idx.score} / 100 ({idx.label.label})</strong>. Distance from this person's own first-week normal. Prototype composite score.</p>
      <table>
        <thead><tr><th>Indicator</th><th>Latest</th><th>Fixed range color</th><th>Model note</th></tr></thead>
        <tbody>
          {rows.map(m => {
            const e = explain[m.metric]
            const f = forecast[m.metric]
            return (
              <tr key={m.metric}>
                <td>{METRIC_NAMES[m.metric] ?? m.metric}</td>
                <td>{formatValue(m.metric, m.value)} {unitLabel(readings.find(r => r.metric === m.metric)?.unit ?? '')}</td>
                <td>{COLOR_NAMES[m.color] ?? '—'}</td>
                <td>{e ? 'Drifting from this person\'s own normal.' : ''} {f ? `If it continues: red in about ${f.daysToRed} days.` : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {withheld > 0 && <p>{withheld} indicator{withheld === 1 ? '' : 's'} not shown: withheld by the crew member's privacy choice.</p>}
      <p className="report-fine">Prototype health monitoring from NASA Space Apps Challenge 2026 (Team Space Monkeys). Not a medical record and not a medical device.</p>
    </section>
  )
}
