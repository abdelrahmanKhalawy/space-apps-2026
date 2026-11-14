import { useEffect, useState } from 'react'

// First-visit help for someone who has never seen AstroPulse (a judge on a phone): one sentence on what it is, and a
// 60-second tour that walks through the screens that tell the story. Dismissed once, remembered on this device.
const KEY = 'astropulse.tour'

const STEPS = [
  { tab: 'status', title: '1 · The astronaut\'s screen', text: 'This is a simulated astronaut, day 14 of a trip to Mars. Sleep is red, so the app says what to do right now and how long Earth needs to answer (40 minutes there and back).' },
  { tab: 'status', title: '2 · Make a number change', text: 'On a phone press "Measure my pulse": it reads your real pulse through your fingertip, using only the camera. On a laptop press "Simulate readings". Then tap any card to see why.' },
  { tab: 'replay', title: '3 · Normal for YOU', text: 'Press play. Ordinary apps use one fixed range for everybody. AstroPulse learns your own normal. Heart rate never leaves green here, yet the flag on day 11 shows it noticed a drift.' },
  { tab: 'crew', title: '4 · One person, or the whole place?', text: 'If one person drifts it is probably personal. If the whole crew drifts together, it is probably the environment (like the air). Try the three scenarios.' },
  { tab: 'evidence', title: '5 · Does it really work?', text: 'We tested it on 2,000 simulated crews and checked the camera pulse on 53 real recordings. One idea of ours failed, and it is listed too.' },
  { tab: 'yourdata', title: '6 · Try it on your own data', text: 'Have a smartwatch? Drop a CSV of your daily resting heart rate. It stays in your browser. No file? Press "Try a sample file".' },
  { tab: 'status', title: '7 · Be the doctor on Earth', text: 'At the very bottom of the page, open "Ground control view". Send a report from the astronaut, then answer it as the flight surgeon and watch the delay both ways.' },
]

const get = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const put = v => { try { localStorage.setItem(KEY, v) } catch { /* private window */ } }

export default function Tour({ onGo, showAgain = true }) {
  const [state, setState] = useState(() => (get() === 'done' ? 'hidden' : 'banner')) // banner | touring | hidden
  const [i, setI] = useState(0)

  useEffect(() => {
    if (state === 'touring') onGo?.(STEPS[i].tab)
  }, [state, i]) // eslint-disable-line react-hooks/exhaustive-deps

  const end = () => { put('done'); setState('hidden') }

  if (state === 'hidden') {
    if (!showAgain) return null
    return (
      <button type="button" className="tour-again cam-link" onClick={() => { setI(0); setState('touring') }}>
        Take the 60-second tour
      </button>
    )
  }
  if (state === 'banner') {
    return (
      <section className="tour-banner" aria-label="About AstroPulse">
        <p>
          <strong className="tour-eyebrow">New here?</strong> AstroPulse helps an astronaut notice when their health drifts from <em>their own</em> normal, days before fixed
          ranges would, and what to do while Earth is minutes away. Everything on screen is sample data.
        </p>
        <div>
          <button type="button" className="ev-btn" onClick={() => { setI(0); setState('touring') }}>Take the 60-second tour</button>{' '}
          <button type="button" className="cam-link" onClick={end}>No thanks</button>
        </div>
      </section>
    )
  }
  const step = STEPS[i]
  return (
    <aside className="tour-card" role="dialog" aria-label="Tour" aria-live="polite">
      <p className="tour-step">
        <span>Tour</span>
        <span>{i + 1} / {STEPS.length}</span>
      </p>
      <div className="tour-bar" aria-hidden="true">
        {STEPS.map((_, k) => <span key={k} className={k <= i ? 'on' : undefined} />)}
      </div>
      <strong>{step.title}</strong>
      <p>{step.text}</p>
      <div className="tour-actions">
        <button type="button" className="cam-link" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
        {i < STEPS.length - 1
          ? <button type="button" className="ev-btn" onClick={() => setI(i + 1)}>Next</button>
          : <button type="button" className="ev-btn" onClick={end}>Done</button>}
        <button type="button" className="cam-link" onClick={end}>Skip tour</button>
      </div>
    </aside>
  )
}
