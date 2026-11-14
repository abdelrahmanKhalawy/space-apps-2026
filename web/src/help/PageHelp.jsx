import { useState } from 'react'

// Plain-language help at the top of every page, written for someone who has never seen the app and knows nothing about health or space:
// what this page is, one or two things to try, and the few words that might be new. Hidden per page with "Hide tips" (remembered on this device).
const KEY = 'astropulse.help.hidden'

export const HELP = {
  status: {
    what: 'This is what the astronaut sees. Each card is one health number (heart rate, sleep and so on). Green means fine, yellow means keep an eye on it, red means do something now.',
    tryIt: [
      'On a phone, press “Measure my pulse”. On a laptop, press “Simulate readings”. A number on the page changes by itself.',
      'Tap a card to open its chart and the reason behind it.',
      'If something is red, press “Guide me through it”, then “Report to Earth”.',
    ],
    words: [
      ['AstroPulse Index', 'One number from 0 to 100 for how far you are from your own normal.'],
      ['Your own normal (baseline)', 'What is usual for you, learned from your first week. Not the same as other people.'],
      ['Flagged', 'The app noticed a steady drift away from your normal.'],
      ['Earth delay', 'A message to Earth takes minutes on a Mars mission, so the crew has to act first.'],
      ['Hazard', 'One of NASA’s five dangers of space travel (radiation, isolation, distance, gravity, a closed space).'],
      ['Sample data', 'Made-up numbers for the demo. The pulse from your camera and the space weather are real.'],
    ],
  },
  body: {
    what: 'A body map. Each part lights up with the color of the health numbers linked to it, so you can see where the problem is at a glance.',
    tryIt: ['Tap a part of the body to see its numbers and the advice for it.'],
  },
  log: {
    what: 'Type in numbers you measured yourself: blood pressure, blood sugar, sleep and mood. The app has no sensors for these, so you enter them by hand.',
    tryIt: ['Fill in only what you measured, then press Send.', 'Go back to Status to see its new color.'],
    words: [['Upper and lower blood pressure', 'Also called systolic (the first, higher number) and diastolic (the second, lower number).']],
  },
  checks: {
    what: 'Two quick tests you can do right now: a reaction test (tiredness makes you slower) and a close-up vision check. They are only compared with your own earlier results.',
    tryIt: ['Run the reaction test a few times on different days to set your own normal.', 'Or press “Load a demo baseline” at the bottom to see how it reacts.'],
  },
  replay: {
    what: 'A replay of the demo story: two weeks on the way to Mars. Ordinary health apps use fixed ranges. AstroPulse compares each person with their own normal. This page shows both side by side.',
    tryIt: ['Press Play.', 'Watch the heart rate row. It stays green all the time, but the flag shows AstroPulse noticed the drift on day 11.'],
    words: [['G / Y / R', 'Green, yellow, red from the fixed ranges.'], ['Flag', 'The day AstroPulse raised its hand about that number.']],
  },
  yourdata: {
    what: 'Try the idea on your own numbers. Export your daily resting heart rate (and sleep, if you have it) from a smartwatch or health app as a CSV file and drop it here. It never leaves your device.',
    tryIt: ['No file? Press “Try a sample file”.', 'Compare “Fixed ranges say” with “Personal baseline says”.'],
    words: [['CSV file', 'A very simple spreadsheet file: one row per day, with a date and a number.']],
  },
  crew: {
    what: 'A made-up crew of four, to answer one question: is a change about one person, or about the place they all share? If one person drifts it is probably personal. If everyone drifts at once, it is probably the environment, like the air.',
    tryIt: ['Switch between the three scenarios at the top.', 'Look at the cabin CO₂ line in the last card.'],
  },
  evidence: {
    what: 'How we checked that the idea works, including what did not work. The numbers come from simulations and public recordings, not from real astronauts.',
    tryIt: ['Read the three big numbers at the top.', 'Press “New crew member” further down to simulate one more person.'],
    words: [['False alarm', 'The app warns even though nothing is wrong. Lower is better.'], ['Simulation', 'Computer-made people, used to test how the method behaves.']],
  },
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}
function write(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private window */ }
}

export default function PageHelp({ tab }) {
  const info = HELP[tab]
  const [hidden, setHidden] = useState(() => Boolean(read()[tab]))
  if (!info) return null
  const set = value => {
    setHidden(value)
    write({ ...read(), [tab]: value })
  }
  if (hidden) {
    return <button type="button" className="cam-link help-show" onClick={() => set(false)}>Show tips for this page</button>
  }
  return (
    <aside className="help" aria-label="About this page">
      <p className="help-what"><strong>What is this page?</strong> {info.what}</p>
      {info.tryIt?.length > 0 && (
        <>
          <p className="help-k">Try this</p>
          <ul className="help-list">{info.tryIt.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </>
      )}
      {info.words?.length > 0 && (
        <details className="help-words">
          <summary>Words you may see here</summary>
          <dl>
            {info.words.map(([w, m]) => (
              <div key={w}><dt>{w}</dt><dd>{m}</dd></div>
            ))}
          </dl>
        </details>
      )}
      <button type="button" className="cam-link" onClick={() => set(true)}>Hide tips</button>
    </aside>
  )
}
