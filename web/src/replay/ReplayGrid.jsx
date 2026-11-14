import { METRIC_NAMES } from '../dashboard/metricInfo.js'

const LETTER = { green: 'G', yellow: 'Y', red: 'R' }
const TONE = { green: '#3ddc84', yellow: '#ffcc4d', orange: '#ff9f43', red: '#ff5d5d' }

/** The day-by-day grid: the fixed color range each day, a flag on the day the model raised its hand, and the Index row. */
export default function ReplayGrid({ replay, day }) {
  return (
      <div className="rp-wrap">
        <table className="rp-table">
          <caption className="rp-cap">Fixed color range each day (G, Y, R). The flag marks the day the model raised its hand for that indicator.</caption>
          <thead>
            <tr>
              <th scope="col">Indicator</th>
              {replay.days.map((_, i) => (
                <th key={i} scope="col" className={i === day ? 'rp-today' : ''}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {replay.rows.map(r => (
              <tr key={r.metric}>
                <th scope="row">{METRIC_NAMES[r.metric]}</th>
                {r.colors.map((c, i) => (
                  <td key={i} className={`rp-cell rp-${c}${i > day ? ' rp-future' : ''}${i === day ? ' rp-today' : ''}`} title={`${METRIC_NAMES[r.metric]}, day ${i + 1}: ${c}`}>
                    {r.modelAlarm === i ? <span className="rp-flag" aria-label="model flagged this">⚑</span> : LETTER[c]}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="rp-index-row">
              <th scope="row">AstroPulse Index</th>
              {replay.index.map((x, i) => (
                <td key={i} className={`rp-idx${i > day ? ' rp-future' : ''}${i === day ? ' rp-today' : ''}`} style={{ color: TONE[x.label.tone] }}>{x.score}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
  )
}
