import { useEffect, useRef, useState } from 'react'
import { BASELINE_RUNS, LAPSE_MS, persistentFlag, summarizeReaction } from './logic.js'

// Quick checks: a reaction test and a near-vision check. Results stay on this device and are only
// compared with the person's OWN earlier runs (see logic.js for why).

const KEY = 'astropulse.checks.v1'
const TRIALS = 8
const LINES = [
  { size: 34, text: 'E  F  P' },
  { size: 26, text: 'T  O  Z' },
  { size: 20, text: 'L  P  E  D' },
  { size: 16, text: 'P  E  C  F  D' },
  { size: 13, text: 'E  D  F  C  Z  P' },
  { size: 10, text: 'F  E  L  O  P  Z  D' },
]

function loadAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { reaction: v.reaction ?? [], vision: v.vision ?? [] }
  } catch {
    return { reaction: [], vision: [] }
  }
}
function saveAll(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* private window: results just won't persist */
  }
}

function Verdict({ history, kind, unit }) {
  const r = persistentFlag(history, kind)
  if (!r.ready) {
    return <p className="hint">Run it {r.runsNeeded} more {r.runsNeeded === 1 ? 'time' : 'times'}: the first {BASELINE_RUNS} runs set what is normal for you.</p>
  }
  if (r.pending) {
    return <p className="chk-flag" role="status">That run was different from your usual. Run it once more to confirm before reading anything into it.</p>
  }
  return (
    <p className={r.flagged ? 'chk-flag' : 'chk-ok'} role="status">
      {r.flagged
        ? kind === 'reaction'
          ? `Slower or patchier than your usual (usual ${r.baseline} ${unit}, now ${r.latest} ${unit}), twice in a row. Tiredness can do this. Consider rest and tell the flight surgeon if it keeps up.`
          : 'Your near vision looks worse than your usual, twice in a row. Re-check in good light. If it persists, tell the flight surgeon: NASA follows vision changes on long missions.'
        : `In line with your usual (${kind === 'reaction' ? `${r.baseline} ${unit}` : `line ${r.baseline}`}).`}
    </p>
  )
}

function ReactionTest({ onDone }) {
  const [phase, setPhase] = useState('idle') // idle | waiting | go | done
  const [trial, setTrial] = useState(0)
  const [msg, setMsg] = useState('')
  const times = useRef([])
  const falseStarts = useRef(0)
  const goAt = useRef(0)
  const timer = useRef(null)

  const next = n => {
    setTrial(n)
    setPhase('waiting')
    setMsg('Wait for green…')
    timer.current = setTimeout(() => {
      goAt.current = performance.now()
      setPhase('go')
      setMsg('TAP!')
    }, 1500 + Math.random() * 2500)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const start = () => {
    times.current = []
    falseStarts.current = 0
    next(0)
  }

  const tap = () => {
    if (phase === 'waiting') {
      clearTimeout(timer.current)
      falseStarts.current++
      setMsg('Too early. Wait for green.')
      next(trial)
    } else if (phase === 'go') {
      times.current.push(performance.now() - goAt.current)
      if (times.current.length >= TRIALS) {
        setPhase('done')
        onDone(summarizeReaction(times.current, falseStarts.current))
      } else next(trial + 1)
    }
  }

  return (
    <div>
      {(phase === 'idle' || phase === 'done') && (
        <button type="button" className="ev-btn" onClick={start}>{phase === 'done' ? 'Run again' : `Start (${TRIALS} taps)`}</button>
      )}
      {(phase === 'waiting' || phase === 'go') && (
        <button type="button" className={phase === 'go' ? 'chk-pad chk-go' : 'chk-pad chk-wait'} onPointerDown={tap}
          aria-label={phase === 'go' ? 'Tap now' : 'Wait for green'}>
          {msg}<small>{trial + 1} / {TRIALS}</small>
        </button>
      )}
    </div>
  )
}

function VisionCheck({ onDone }) {
  return (
    <div>
      <p className="hint">Hold the phone at arm's length, in good light, one eye at a time or both with your usual glasses. Tap the smallest line you can read clearly.</p>
      <div className="chk-chart">
        {LINES.map((l, i) => (
          <button key={i} type="button" className="chk-line" style={{ fontSize: l.size }} onClick={() => onDone({ line: i + 1 })} aria-label={`Line ${i + 1}`}>
            {l.text}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ChecksView() {
  const [all, setAll] = useState(loadAll)
  const add = (kind, result) => {
    const next = { ...all, [kind]: [...all[kind], { ...result, takenAt: new Date().toISOString() }] }
    setAll(next)
    saveAll(next)
  }
  const seedDemo = () => {
    const t = new Date().toISOString()
    const next = {
      reaction: [248, 262, 255].map(m => ({ median: m, lapses: 0, falseStarts: 0, n: TRIALS, takenAt: t })),
      vision: [5, 5, 6].map(line => ({ line, takenAt: t })),
    }
    setAll(next)
    saveAll(next)
  }
  const reset = () => {
    const empty = { reaction: [], vision: [] }
    setAll(empty)
    saveAll(empty)
  }
  const last = all.reaction[all.reaction.length - 1]

  return (
    <section className="checks">
      <div className="ev-banner" role="note">
        <strong>Experimental self-checks.</strong> Not medical tests. They are only compared with <em>your own</em> earlier results, never with a population.
      </div>
      <h2>Quick checks</h2>

      <div className="ev-block">
        <h3>Reaction test</h3>
        <p className="hint">Tap as fast as you can when the pad turns green. Tiredness shows up as slower, patchier reactions (a lapse is anything over {LAPSE_MS} ms).</p>
        <ReactionTest onDone={r => add('reaction', r)} />
        {last && <p className="chk-last">Last run: median <strong>{last.median} ms</strong>, {last.lapses} lapse{last.lapses === 1 ? '' : 's'}, {last.falseStarts} early tap{last.falseStarts === 1 ? '' : 's'}.</p>}
        <Verdict history={all.reaction} kind="reaction" unit="ms" />
      </div>

      <div className="ev-block">
        <h3>Near-vision check</h3>
        <VisionCheck onDone={r => add('vision', r)} />
        {all.vision.length > 0 && <p className="chk-last">Last result: line <strong>{all.vision[all.vision.length - 1].line}</strong> of {LINES.length}.</p>}
        <Verdict history={all.vision} kind="vision" unit="" />
        <p className="ebadge-row">
          <span className="ebadge ebadge-ours">Our own</span>
          <span>A screen can't give true eyesight numbers (size and distance vary). We only look for a change from your own earlier results. NASA studies a vision condition of long flights (SANS), which is why this is here.</span>
        </p>
      </div>

      <p className="hint">
        Results stay in this browser. <button type="button" className="cam-link" onClick={seedDemo}>Load a demo baseline</button> (for presenting: fills in your first runs)
        {' · '}<button type="button" className="cam-link" onClick={reset}>Clear results</button>
      </p>
    </section>
  )
}
