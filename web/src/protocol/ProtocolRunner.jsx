import { useEffect, useMemo, useState } from 'react'
import thresholds from '../dashboard/thresholds.js'
import { METRIC_NAMES, unitLabel } from '../dashboard/metricInfo.js'
import { formatValue } from '../dashboard/status.js'
import CameraPulse from '../live/CameraPulse.jsx'
import { formatCountdown } from '../decision/mission.js'
import { isShared, loadConsent } from '../privacy/consent.js'
import { queueReadings } from '../offline/outbox.js'
import { OUTCOME_TEXT, attemptsSummary, buildProtocol, evaluateRemeasure } from './logic.js'

const CREW_ID = 'crew-1'
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

/**
 * "Guide me": a short pathway for one yellow or red indicator. What to do now, wait, measure again, then a decision:
 * back in range, closer, or not better (tell Earth, with what was tried). Decision support in a prototype, not medical advice.
 */
export default function ProtocolRunner({ item, mission = 'mars', unit }) {
  const rules = thresholds[item.metric]
  const protocol = useMemo(() => buildProtocol({ metric: item.metric, color: item.color, advice: item.advice }), [item])
  const name = METRIC_NAMES[item.metric] ?? item.metric
  const u = unitLabel(unit ?? rules?.unit ?? '')

  const [phase, setPhase] = useState('closed') // closed | steps | waiting | measuring | result | tomorrow
  const [left, setLeft] = useState(protocol.waitSeconds)
  const [typed, setTyped] = useState('')
  const [after, setAfter] = useState(null)
  const [saved, setSaved] = useState(false)
  const [reported, setReported] = useState(null) // null | 'sending' | 'ok' | 'fail'

  useEffect(() => {
    if (phase !== 'waiting') return undefined
    const t = setInterval(() => setLeft(l => Math.max(0, l - 1)), 1000)
    return () => clearInterval(t)
  }, [phase])

  const evalResult = after != null ? evaluateRemeasure({ rules, beforeValue: item.value, afterValue: after }) : null
  const fmt = v => `${formatValue(item.metric, v)} ${u}`.trim()

  const reset = () => {
    setPhase('closed'); setLeft(protocol.waitSeconds); setTyped(''); setAfter(null); setSaved(false); setReported(null)
  }

  async function saveReading() {
    const reading = { crewId: CREW_ID, metric: item.metric, value: after, unit: rules.unit, takenAt: iso(Date.now()), source: item.metric === 'heart_rate' ? 'camera' : 'manual' }
    try {
      const res = await fetch('/api/readings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([reading]) })
      if (!res.ok) throw new Error('rejected')
    } catch {
      queueReadings([reading]) // no link: keep it on the device and send it later
    }
    setSaved(true)
  }

  async function tellEarth() {
    setReported('sending')
    const summaryLine = attemptsSummary({
      name, instructions: protocol.instructions, beforeText: fmt(item.value), afterText: fmt(after),
      waitMinutes: Math.round(protocol.waitSeconds / 60), outcome: evalResult.outcome,
    })
    // Privacy choices still apply: if this group is not shared, Earth is told something persists, without the details.
    const shared = isShared(item.metric, loadConsent())
    const body = {
      crewId: CREW_ID,
      mission,
      severity: evalResult.afterColor === 'red' ? 'red' : 'yellow',
      summary: (shared
        ? `${name} ${fmt(after)} after the crew member's own steps. ${summaryLine}`
        : "A health issue persists after the crew member's own steps. The crew member chose not to share the details.").slice(0, 1000),
      metrics: shared ? [item.metric] : [],
    }
    try {
      const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setReported(res.ok ? 'ok' : 'fail')
    } catch {
      setReported('fail')
    }
  }

  if (phase === 'closed') {
    return (
      <button type="button" className="proto-start" onClick={e => { e.stopPropagation(); setPhase('steps') }}>
        Guide me through it
      </button>
    )
  }

  return (
    <div className="proto" onClick={e => e.stopPropagation()}>
      <p className="proto-head"><strong>Guided steps for {name}</strong> <button type="button" className="cam-link" onClick={reset}>Close</button></p>
      <p className="hint">Decision support in a prototype, not medical advice.</p>

      {phase === 'steps' && (
        <>
          <p className="proto-k">1. Do this now</p>
          <ul className="proto-list">{protocol.instructions.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {protocol.reportFirst && <p className="proto-warn">This one is red: tell Earth now with “Report to Earth” above. You do not need to wait for the re-measure.</p>}
          {protocol.remeasure ? (
            <button type="button" className="ev-btn" onClick={() => { setLeft(protocol.waitSeconds); setPhase('waiting') }}>
              Done. Start the {Math.round(protocol.waitSeconds / 60)}-minute timer
            </button>
          ) : (
            <button type="button" className="ev-btn" onClick={() => setPhase('tomorrow')}>Done</button>
          )}
        </>
      )}

      {phase === 'waiting' && (
        <>
          <p className="proto-k">2. Wait, then measure again</p>
          <p className="proto-count" role="timer">{formatCountdown(left)}</p>
          <button type="button" className="ev-btn" disabled={left > 0} onClick={() => setPhase('measuring')}>I'm ready to measure again</button>{' '}
          <button type="button" className="cam-link" onClick={() => { setLeft(0); setPhase('measuring') }}>Skip the wait (demo)</button>
        </>
      )}

      {phase === 'measuring' && (
        <>
          <p className="proto-k">3. Measure again</p>
          {item.metric === 'heart_rate' && (
            <CameraPulse buttonLabel="Measure with the phone camera" onUse={v => { setAfter(v); setPhase('result') }} />
          )}
          <label className="proto-input">
            <span>{item.metric === 'heart_rate' ? 'Or type the new value' : 'Type the new value'} ({u})</span>
            <input inputMode="decimal" value={typed} onChange={e => setTyped(e.target.value)} placeholder={String(Math.round(item.value))} />
          </label>
          <button type="button" className="ev-btn" disabled={!(Number(typed) > 0)} onClick={() => { setAfter(Number(typed)); setPhase('result') }}>Use this value</button>
        </>
      )}

      {phase === 'result' && evalResult && (
        <>
          <p className="proto-k">4. What this means</p>
          <p className={`proto-out proto-${evalResult.outcome}`} role="status">
            {fmt(item.value)} → <strong>{fmt(after)}</strong>. {OUTCOME_TEXT[evalResult.outcome]}
          </p>
          {evalResult.next === 'tell_earth' && (
            reported === 'ok' ? <p className="cam-ok">Sent to Earth, with what you tried. The reply arrives after the delay.</p> : (
              <>
                <button type="button" className="ev-btn" disabled={reported === 'sending'} onClick={tellEarth}>
                  {reported === 'sending' ? 'Sending…' : 'Tell Earth, with what I tried'}
                </button>
                {reported === 'fail' && <p className="cam-error">Could not reach the server. Try again.</p>}
              </>
            )
          )}
          {evalResult.next === 'recheck' && (
            <button type="button" className="ev-btn" onClick={() => { setLeft(Math.min(protocol.waitSeconds, 5 * 60)); setTyped(''); setPhase('waiting') }}>
              Rest 5 more minutes, then measure again
            </button>
          )}
          {evalResult.next === 'monitor' && (saved ? <p className="cam-ok">Saved.</p> : (
            <button type="button" className="ev-btn" onClick={saveReading}>Save this reading</button>
          ))}
        </>
      )}

      {phase === 'tomorrow' && (
        <p className="proto-out proto-same" role="status">
          This one is a follow-up, not a re-measure. Log it again tomorrow
          {protocol.color === 'red' ? ', and talk to the flight surgeon today.' : '. If it stays like this for a few days, tell the flight surgeon.'}
        </p>
      )}
    </div>
  )
}
