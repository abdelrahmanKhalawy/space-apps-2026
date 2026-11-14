import { useMemo, useState } from 'react'
import thresholds from '../dashboard/thresholds.js'
import { computeIndex } from '../dashboard/astroIndex.js'
import { analyzeCause } from './cause.js'
import { CABIN_CO2_LIMIT, DRIFT_START, SCENARIO_LABELS, makeScenario } from './scenarios.js'

const TONE = { green: '#3ddc84', yellow: '#ffcc4d', orange: '#ff9f43', red: '#ff5d5d' }

function Spark({ values, color = 'var(--accent)', limit, label }) {
  const W = 160
  const H = 44
  const lo = Math.min(...values, limit ?? Infinity)
  const hi = Math.max(...values, limit ?? -Infinity)
  const x = i => 3 + (i / (values.length - 1)) * (W - 6)
  const y = v => 3 + (1 - (v - lo) / (hi - lo || 1)) * (H - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="crew-spark" role="img" aria-label={label}>
      <line x1={x(DRIFT_START)} x2={x(DRIFT_START)} y1="0" y2={H} stroke="var(--line)" strokeDasharray="2 3" />
      {limit != null && <line x1="0" x2={W} y1={y(limit)} y2={y(limit)} stroke="var(--red)" strokeDasharray="3 3" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  )
}

export default function CrewView() {
  const [scenario, setScenario] = useState('personal')
  const [seed, setSeed] = useState(1)
  const scn = useMemo(() => makeScenario(scenario, seed), [scenario, seed])
  const cause = useMemo(() => analyzeCause(scn), [scn])
  const indexes = useMemo(() => scn.people.map(p => computeIndex(p.readings, thresholds)), [scn])

  return (
    <section className="crew">
      <div className="ev-banner" role="note">
        <strong>Simulated crew of four.</strong> The people and numbers are invented, to show the idea.
      </div>
      <h2>Is it the person or the environment?</h2>
      <p className="hint">
        Each person is compared with their own first week. One person moving looks personal. The whole crew moving together points at
        something shared, like the air or the schedule.
      </p>

      <div className="crew-controls" role="group" aria-label="Scenario">
        {Object.entries(SCENARIO_LABELS).map(([id, label]) => (
          <button key={id} type="button" className={scenario === id ? 'tab on' : 'tab'} onClick={() => setScenario(id)}>{label}</button>
        ))}
        <button type="button" className="cam-link" onClick={() => setSeed(s => s + 1)}>New random crew</button>
      </div>

      <div className={`crew-verdict crew-${cause.kind}`} role="status">
        <strong>{cause.headline}</strong>
        <span>{cause.detail}</span>
        <span className="tag tag-reasoning">Our reasoning, not a NASA method</span>
      </div>

      <div className="crew-grid">
        {scn.people.map((p, i) => {
          const idx = indexes[i]
          const flagged = cause.flagged.includes(p.id)
          return (
            <div key={p.id} className={flagged ? 'crew-card crew-flagged' : 'crew-card'}>
              <div className="crew-name">
                <strong>{p.name}</strong>
                <span style={{ color: TONE[idx.label.tone] }}>Index {idx.score} · {idx.label.label}</span>
              </div>
              <div className="crew-row"><span>Sleep</span><Spark values={p.daily.sleep_hours} color={flagged ? 'var(--red)' : 'var(--accent)'} label={`${p.name} sleep over 14 days`} /></div>
              <div className="crew-row"><span>Heart rate</span><Spark values={p.daily.heart_rate} color={flagged ? 'var(--red)' : 'var(--accent)'} label={`${p.name} resting heart rate over 14 days`} /></div>
            </div>
          )
        })}
        <div className="crew-card crew-cabin">
          <div className="crew-name"><strong>Shared cabin</strong><span>{cause.co2Now.toFixed(1)} mmHg CO₂ now</span></div>
          <div className="crew-row"><span>CO₂</span><Spark values={scn.cabin.co2} limit={CABIN_CO2_LIMIT} color={cause.co2High ? 'var(--red)' : 'var(--green)'} label="Cabin CO2 over 14 days with the NASA limit line" /></div>
          <p className="ebadge-row">
            <span className="ebadge ebadge-disputed" title="Studies disagree">Disputed</span>
            <span>Does CO₂ at station levels affect thinking? NASA's own brief says several studies found no effect at current levels, while an older chamber study found effects below the headache threshold. Headaches on the ISS are better documented.</span>
          </p>
          <p className="idx-fine">Dashed red line: about {CABIN_CO2_LIMIT} mmHg, the limit in NASA's CO₂ technical brief. Dotted vertical line: end of the baseline week.</p>
        </div>
      </div>

      <p className="hint">
        How good is the rule? <code>node web/src/crew/cause.test.mjs</code> runs it on 300 random simulated crews per scenario. These are clean,
        idealized cases (a clear drift), so real crews would be harder. Never validated on real astronauts.
      </p>
    </section>
  )
}
