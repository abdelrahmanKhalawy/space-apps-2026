import { useEffect, useMemo, useState } from 'react'
import sample from '../../../data/mock/day143.json'
import thresholds from '../dashboard/thresholds.js'
import { METRIC_NAMES, METRIC_ORDER } from '../dashboard/metricInfo.js'
import { buildReplay } from './logic.js'

// Replay of the demo scenario: what the fixed color ranges said, day by day, next to what AstroPulse's
// personal baseline said. Everything here is the synthetic Day-143 sample data, and the screen says so.

const LETTER = { green: 'G', yellow: 'Y', red: 'R' }
const TONE = { green: '#3ddc84', yellow: '#ffcc4d', orange: '#ff9f43', red: '#ff5d5d' }

export default function ReplayView() {
  const replay = useMemo(() => buildReplay(sample.filter(r => r.crewId === 'crew-1'), thresholds, METRIC_ORDER), [])
  const last = replay.days.length - 1
  const [day, setDay] = useState(last)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing) return undefined
    const timer = setInterval(() => {
      setDay(d => {
        if (d >= last) {
          setPlaying(false)
          return d
        }
        return d + 1
      })
    }, 900)
    return () => clearInterval(timer)
  }, [playing, last])

  const play = () => {
    if (day >= last) setDay(0)
    setPlaying(p => !p)
  }

  const idx = replay.index[day]
  const flagged = replay.rows.filter(r => r.modelAlarm != null && r.modelAlarm <= day)
  const nonGreen = replay.rows.filter(r => r.colors[day] && r.colors[day] !== 'green')
  const tone = TONE[idx.label.tone]

  return (
    <section className="replay">
      <div className="ev-banner" role="note">
        <strong>Replay of the sample scenario.</strong> Synthetic data: a simulated crew member over 14 days, to show how the two approaches behave.
      </div>
      <h2>Day 143: what the colors said, and what AstroPulse said</h2>
      <p className="hint">
        Fixed color ranges treat everyone the same. AstroPulse compares you with your own first week, so it can speak up while your numbers are still inside the
        &ldquo;normal&rdquo; range. Press play, or drag to any day.
      </p>

      <div className="rp-controls">
        <button type="button" className="ev-btn" onClick={play}>{playing ? 'Pause' : day >= last ? 'Replay' : 'Play'}</button>
        <label className="rp-slider">
          <span>Day {day + 1} of {replay.days.length}</span>
          <input type="range" min="0" max={last} value={day} onChange={e => { setPlaying(false); setDay(Number(e.target.value)) }} aria-label="Day" />
        </label>
      </div>

      <div className="rp-now" role="status">
        <div className="rp-card">
          <span className="rp-k">Fixed color ranges say</span>
          <strong>{nonGreen.length === 0 ? 'All green' : `${nonGreen.length} indicator${nonGreen.length === 1 ? '' : 's'} outside the range`}</strong>
          <small>{nonGreen.length === 0 ? 'Nothing to act on.' : nonGreen.map(r => METRIC_NAMES[r.metric]).join(', ')}</small>
        </div>
        <div className="rp-card" style={{ borderColor: tone }}>
          <span className="rp-k">AstroPulse Index</span>
          <strong style={{ color: tone }}>{idx.score} · {idx.label.label}</strong>
          <small>{idx.baselineReady ? 'Distance from your own normal.' : 'Still learning your normal (first week).'}</small>
        </div>
        <div className="rp-card">
          <span className="rp-k">Model flags (sustained 4 days)</span>
          <strong>{flagged.length === 0 ? 'None yet' : `${flagged.length} drifting`}</strong>
          <small>{flagged.length === 0 ? 'Needs 4 days of evidence.' : flagged.map(r => METRIC_NAMES[r.metric]).join(', ')}</small>
        </div>
      </div>

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

      <section className="ev-block">
        <h3>What this shows</h3>
        <ul className="ev-limits">
          {replay.earlier.map(r => (
            <li key={r.metric}>
              <strong>{METRIC_NAMES[r.metric]}:</strong> the model flagged the drift on day {r.modelAlarm + 1}
              {r.firstNonGreen == null ? ', while the fixed range never left green.' : `, before the fixed range changed on day ${r.firstNonGreen + 1}.`}
            </li>
          ))}
          {replay.rows
            .filter(r => r.modelAlarm != null && r.firstNonGreen != null && r.firstNonGreen < r.modelAlarm)
            .map(r => (
              <li key={r.metric}>
                <strong>{METRIC_NAMES[r.metric]}:</strong> here the fixed range was first (day {r.firstNonGreen + 1}, the model on day {r.modelAlarm + 1}). A personal
                baseline is not always faster. It catches what the ranges miss, and it never replaces them.
              </li>
            ))}
        </ul>
        <p className="hint">
          Our own method, shown on invented data. The Evidence tab tests the same rule on many simulated crews, including how often it raises a false alarm.
        </p>
      </section>
    </section>
  )
}
