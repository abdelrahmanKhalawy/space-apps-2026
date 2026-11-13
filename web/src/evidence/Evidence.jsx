import { useMemo, useState } from 'react'
import results from '../../../data/trial/results.json'
import thresholds from '../dashboard/thresholds.js'
import { METRICS, METRIC_LABEL, allAlarms, makeCrew, mulberry32 } from './trial.js'

// The Evidence tab: what a Monte Carlo trial (ai/trial.py) says about personal baselines
// versus fixed color thresholds. Everything here is a SIMULATION, and the page says so.

const pct = x => (x == null ? '—' : `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0)}%`)
const days = x => (x == null ? '—' : `${x} d`)
const BANDS = Object.fromEntries(METRICS.map(m => [m, thresholds[m].bands]))
const BAND_FILL = { green: '#3ddc84', yellow: '#ffcc4d', red: '#ff5d5d' }
const FAMILY_COLOR = { zscore: '#6ea8ff', cusum: '#c084fc', fixed: '#ff5d5d' }

function Stat({ big, label, note }) {
  return (
    <div className="ev-stat">
      <div className="ev-big">{big}</div>
      <div className="ev-label">{label}</div>
      {note && <div className="ev-note">{note}</div>}
    </div>
  )
}

// x = healthy false-alarm rate, y = median days after the drift starts. Lower-left is better.
function TradeoffChart({ tradeoff }) {
  const W = 560
  const H = 300
  const M = { top: 14, right: 16, bottom: 42, left: 46 }
  const pts = [...tradeoff.points, tradeoff.fixed].filter(p => p.median_days_after_onset != null)
  const maxY = Math.max(10, ...pts.map(p => p.median_days_after_onset)) + 1
  const x = v => M.left + v * (W - M.left - M.right)
  const y = v => H - M.bottom - (v / maxY) * (H - M.top - M.bottom) // 0 days at the bottom, so lower-left is best
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ev-svg" role="img"
      aria-label="Trade-off between false alarms and days to detect a drift, for personal detectors and fixed colors">
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} stroke="var(--line)" strokeDasharray="2 4" />
          <text x={x(t)} y={H - M.bottom + 16} textAnchor="middle" fill="var(--muted)" fontSize="11">{t * 100}%</text>
        </g>
      ))}
      {[0, 2, 4, 6, 8, 10].filter(t => t <= maxY).map(t => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 4" />
          <text x={M.left - 6} y={y(t) + 4} textAnchor="end" fill="var(--muted)" fontSize="11">{t}</text>
        </g>
      ))}
      <text x={(W + M.left - M.right) / 2} y={H - 6} textAnchor="middle" fill="var(--muted)" fontSize="12">
        False alarms on healthy crews (30 days) →
      </text>
      <text transform={`translate(12 ${(H - M.bottom + M.top) / 2}) rotate(-90)`} textAnchor="middle" fill="var(--muted)" fontSize="12">
        Days after drift starts →
      </text>
      {tradeoff.points.filter(p => p.median_days_after_onset != null).map(p => (
        <circle key={p.label} cx={x(p.false_alarm_rate)} cy={y(p.median_days_after_onset)} r="4.5"
          fill={FAMILY_COLOR[p.family]} fillOpacity="0.55" stroke={FAMILY_COLOR[p.family]}>
          <title>{`${p.label}: ${pct(p.false_alarm_rate)} false alarms, ${p.median_days_after_onset} d, catches ${pct(p.true_detection_rate)}`}</title>
        </circle>
      ))}
      <rect x={x(tradeoff.fixed.false_alarm_rate) - 7} y={y(tradeoff.fixed.median_days_after_onset) - 7} width="14" height="14"
        fill={FAMILY_COLOR.fixed} stroke="#fff" strokeWidth="1.5">
        <title>{`Fixed colors: ${pct(tradeoff.fixed.false_alarm_rate)} false alarms, ${tradeoff.fixed.median_days_after_onset} d, catches ${pct(tradeoff.fixed.true_detection_rate)}`}</title>
      </rect>
      <text x={x(tradeoff.fixed.false_alarm_rate) + 12} y={y(tradeoff.fixed.median_days_after_onset) + 4} fill="var(--text)" fontSize="12">
        Fixed colors
      </text>
    </svg>
  )
}

function CrewChart({ crew, alarms, metric }) {
  const W = 620
  const H = 240
  const M = { top: 12, right: 14, bottom: 28, left: 46 }
  const vals = crew.series[metric]
  const bands = BANDS[metric]
  const lo0 = Math.min(...vals)
  const hi0 = Math.max(...vals)
  const pad = (hi0 - lo0) * 0.15 || 1
  const lo = lo0 - pad
  const hi = hi0 + pad
  const n = vals.length
  const x = d => M.left + (d / (n - 1)) * (W - M.left - M.right)
  const y = v => M.top + (1 - (v - lo) / (hi - lo)) * (H - M.top - M.bottom)
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const marks = [
    ['onset', crew.onset, '#9aa6d6', 'Drift starts'],
    ['personal', alarms.zscore, FAMILY_COLOR.zscore, 'Personal baseline (≈5% false-alarm setting)'],
    ['fixed', alarms.fixed, FAMILY_COLOR.fixed, 'Fixed colors change'],
  ].filter(m => m[1] != null)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ev-svg" role="img" aria-label={`${METRIC_LABEL[metric]} over 30 days with alarm markers`}>
      {bands.map((b, i) => {
        const top = Math.min(hi, b.max ?? hi)
        const bot = Math.max(lo, b.min ?? lo)
        if (top <= bot) return null
        return <rect key={i} x={M.left} width={W - M.left - M.right} y={y(top)} height={y(bot) - y(top)} fill={BAND_FILL[b.color]} fillOpacity="0.1" />
      })}
      <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} stroke="var(--line)" />
      <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--line)" />
      {[lo + pad / 2, (lo + hi) / 2, hi - pad / 2].map(v => (
        <text key={v} x={M.left - 6} y={y(v) + 4} textAnchor="end" fill="var(--muted)" fontSize="11">{v.toFixed(metric === 'sleep_hours' ? 1 : 0)}</text>
      ))}
      {[0, 7, 14, 21, 29].map(d => (
        <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fill="var(--muted)" fontSize="11">day {d + 1}</text>
      ))}
      <line x1={x(6.5)} x2={x(6.5)} y1={M.top} y2={H - M.bottom} stroke="var(--muted)" strokeDasharray="3 4" />
      <text x={x(6.5) + 4} y={M.top + 10} fill="var(--muted)" fontSize="10">baseline week</text>
      <path d={path} fill="none" stroke="var(--text)" strokeWidth="2" />
      {marks.map(([k, d, color, label], i) => (
        <g key={k}>
          <line x1={x(d)} x2={x(d)} y1={M.top} y2={H - M.bottom} stroke={color} strokeWidth="2" strokeDasharray={k === 'onset' ? '2 3' : undefined} />
          <text x={x(d) + 4} y={M.top + 24 + i * 12} fill={color} fontSize="11">{label} (day {d + 1})</text>
        </g>
      ))}
    </svg>
  )
}

function Replay() {
  const [seed, setSeed] = useState(2026)
  const [drifting, setDrifting] = useState(true)
  const [metric, setMetric] = useState('sleep_hours')
  const crew = useMemo(() => makeCrew(mulberry32(seed), drifting, results.config), [seed, drifting])
  const alarms = useMemo(() => allAlarms(crew.series, BANDS, results.config, results.calibration), [crew])
  const sentence = () => {
    const p = alarms.zscore
    const f = alarms.fixed
    if (!crew.drifting) {
      return `This crew member is healthy. Personal baseline: ${p == null ? 'no alarm' : `false alarm on day ${p + 1}`}. Fixed colors: ${f == null ? 'no change' : `changed on day ${f + 1} (noise)`}.`
    }
    const when = d => (d == null ? 'never' : `day ${d + 1}`)
    return `Drift starts on day ${crew.onset + 1}. Personal baseline alarms: ${when(p)}. Fixed colors change: ${when(f)}.`
  }
  return (
    <section className="ev-block">
      <h3>Run a new virtual crew member</h3>
      <p className="hint">A fresh simulated person, generated in your browser. Same process the trial uses, different random draw.</p>
      <div className="ev-controls">
        <button type="button" className="ev-btn" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>New crew member</button>
        <label className="ev-check"><input type="checkbox" checked={drifting} onChange={e => setDrifting(e.target.checked)} /> Has a drift</label>
        <select value={metric} onChange={e => setMetric(e.target.value)} aria-label="Metric to plot">
          {METRICS.map(m => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
        </select>
      </div>
      <CrewChart crew={crew} alarms={alarms} metric={metric} />
      <p className="ev-sentence">{sentence()}</p>
    </section>
  )
}

export default function Evidence() {
  const { tradeoff, detectors, fixed, hypotheses, sensitivity, calibration, config } = results
  const matched = tradeoff.matched_false_alarm
  const low = tradeoff.at_5pct_false_alarm
  const prod = detectors.production
  const z = calibration.zscore
  const rows = [
    ['Fixed colors (color change)', fixed.false_alarm_rate, fixed.onset_aligned.true_detection_rate, fixed.onset_aligned.median_days_after_onset],
    ...Object.values(detectors).map(d => [d.label, d.false_alarm_rate, d.onset_aligned.true_detection_rate, d.onset_aligned.median_days_after_onset]),
  ]
  return (
    <div className="evidence">
      <div className="ev-banner" role="note">
        <strong>This is a simulation, not real astronauts.</strong> {config.n_per_arm * 2} virtual crew members per run, with
        invented noise levels (listed below). It shows how the method behaves under those assumptions. It is not a clinical validation.
      </div>

      <h2>Does a personal baseline actually help?</h2>
      <p className="hint">
        A Monte Carlo trial, the same style NASA uses for medical risk planning. Half the virtual crew drift slowly (like Day 143),
        half stay healthy. We measure how fast each method notices the drift and how often it cries wolf.
      </p>

      <div className="ev-stats">
        <Stat big={`${pct(matched.true_detection_rate)} vs ${pct(fixed.onset_aligned.true_detection_rate)}`}
          label="drifts caught, at the same false-alarm rate as fixed colors"
          note={`${matched.median_days_after_onset} days after the drift starts, vs ${fixed.onset_aligned.median_days_after_onset} for fixed colors. ${pct(matched.false_alarm_rate)} vs ${pct(fixed.false_alarm_rate)} false alarms.`} />
        <Stat big={pct(low.true_detection_rate)}
          label={`drifts caught with only ${pct(low.false_alarm_rate)} false alarms`}
          note={`Median ${low.median_days_after_onset} days after the drift starts (fixed colors: ${fixed.onset_aligned.median_days_after_onset}, with ${pct(fixed.false_alarm_rate)} false alarms).`} />
        <Stat big={pct(prod.false_alarm_rate)}
          label="false alarms from our first model, under realistic noise"
          note={`This trial showed that our first model (z ≥ 1.3, 2 days) cried wolf on nearly every healthy crew. So we recalibrated it: the live app now uses z ≥ ${z.z} for ${z.sustained} days (${pct(detectors.zscore.false_alarm_rate)} false alarms here).`} />
      </div>

      <section className="ev-block">
        <h3>Speed against false alarms</h3>
        <p className="hint">Each dot is one detector setting. Lower and further left is better. Fixed colors can't be tuned, so they are one point.</p>
        <TradeoffChart tradeoff={tradeoff} />
        <p className="ev-legend">
          <span style={{ color: FAMILY_COLOR.zscore }}>● Personal baseline, z-score</span>{' '}
          <span style={{ color: FAMILY_COLOR.cusum }}>● Personal baseline, CUSUM</span>{' '}
          <span style={{ color: FAMILY_COLOR.fixed }}>■ Fixed colors</span>
        </p>
      </section>

      <section className="ev-block">
        <h3>Results on the held-out test set</h3>
        <div className="ev-table-wrap">
          <table className="ev-table">
            <thead>
              <tr><th>Method</th><th>False alarms (healthy)</th><th>Drifts caught</th><th>Median days after drift starts</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r[0]}><td>{r[0]}</td><td>{pct(r[1])}</td><td>{pct(r[2])}</td><td>{days(r[3])}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          An alarm before the drift even starts counts as a false alarm for every method, so no method is flattered by noise.
          Settings were chosen on a separate calibration set; these numbers are on a different, unseen set.
        </p>
      </section>

      <section className="ev-block">
        <h3>What we predicted, and what happened</h3>
        <p className="hint">Written down before the first run (see the top of ai/trial.py). We report the miss too.</p>
        <ul className="ev-hyp">
          {Object.entries(hypotheses).map(([k, h]) => (
            <li key={k} className={h.passed ? 'ev-pass' : 'ev-fail'}>
              <strong>{k} · {h.passed ? 'held' : 'did not hold'}.</strong> {h.text}.{' '}
              {k === 'H1' ? `Measured median lead: ${h.value} day (95% CI ${h.ci[0]} to ${h.ci[1]}).` : `Measured: ${pct(h.value)}.`}
            </li>
          ))}
        </ul>
        <p className="hint">
          H1 failed because the fixed colors also fire on noise before any drift starts, which distorts that comparison.
          The analysis above, which counts early alarms as false alarms and compares at matched false-alarm rates, was added
          afterwards and is labeled post-hoc. It is a fairer comparison, but it was chosen after seeing H1 fail.
        </p>
      </section>

      <section className="ev-block">
        <h3>How much do the assumptions matter?</h3>
        <div className="ev-table-wrap">
          <table className="ev-table">
            <thead><tr><th>Day-to-day noise</th><th>Fixed colors false alarms</th><th>Personal z-score false alarms</th><th>Personal z-score catches</th></tr></thead>
            <tbody>
              {[['×0.5', sensitivity['0.5']], ['×1 (main run)', { fixed, detectors }], ['×1.5', sensitivity['1.5']]].map(([label, r]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{pct(r.fixed.false_alarm_rate)}</td>
                  <td>{pct(r.detectors.zscore.false_alarm_rate)}</td>
                  <td>{pct(r.detectors.zscore.onset_aligned.true_detection_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">The detector settings stay the same across rows; only the simulated noise changes. More noise means more false alarms for everyone, and personal baselines hold up better.</p>
      </section>

      <Replay />

      <section className="ev-block">
        <h3>What this does not show</h3>
        <ul className="ev-limits">
          <li>The crews are invented. Between-person spread and day-to-day noise are assumptions, not measurements (sleep is centred near the ISS figure of about 6.2 h from one published sample).</li>
          <li>Drift is a straight line on up to three metrics. Real health problems are messier.</li>
          <li>No real astronaut data was used. Real validation would need analog missions such as HERA or CHAPEA.</li>
          <li>AstroPulse is a prototype and not a medical device.</li>
        </ul>
        <p className="hint">Reproduce: <code>python ai/trial.py</code>. The browser detectors are checked against the Python ones by <code>node web/src/evidence/parity.mjs</code>.</p>
      </section>
    </div>
  )
}
