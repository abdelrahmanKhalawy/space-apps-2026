import { useEffect, useState } from 'react'

// First-visit help for someone who has never seen AstroPulse (a judge on a phone): one sentence on what it is, and a
// 60-second tour that walks through the screens that tell the story. Dismissed once, remembered on this device.
const KEY = 'astropulse.tour'

const STEPS = [
  { tab: 'status', title: '1 · The crew member\'s screen', text: 'Day 14 of a simulated trip to Mars. Sleep is red, so the app says what to do now and how long Earth needs to answer. Try "Report to Earth".' },
  { tab: 'replay', title: '2 · Normal for YOU', text: 'Press play. Heart rate never leaves green, yet the flag on day 11 shows AstroPulse noticed it was drifting from this person\'s own normal.' },
  { tab: 'evidence', title: '3 · We tested it, and show the misses', text: 'Two thousand simulated crews, and 53 real pulse recordings for the camera feature. One hypothesis failed and it is listed.' },
  { tab: 'yourdata', title: '4 · Try it on your own data', text: 'Have a smartwatch? Drop a CSV of daily resting heart rate. It stays in your browser. Or try the sample file.' },
  { tab: 'status', title: '5 · Your turn', text: 'Tap "Measure my pulse" on a phone, or "Simulate readings". Open the Ground control link at the bottom to play the flight surgeon.' },
]

const get = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const put = v => { try { localStorage.setItem(KEY, v) } catch { /* private window */ } }

export default function Tour({ onGo }) {
  const [state, setState] = useState(() => (get() === 'done' ? 'hidden' : 'banner')) // banner | touring | hidden
  const [i, setI] = useState(0)

  useEffect(() => {
    if (state === 'touring') onGo?.(STEPS[i].tab)
  }, [state, i]) // eslint-disable-line react-hooks/exhaustive-deps

  const end = () => { put('done'); setState('hidden') }

  if (state === 'hidden') {
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
          <strong>New here?</strong> AstroPulse helps an astronaut notice when their health drifts from <em>their own</em> normal, days before fixed
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
      <p className="tour-step">{i + 1} of {STEPS.length}</p>
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
