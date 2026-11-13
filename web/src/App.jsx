import { lazy, Suspense, useEffect, useState } from 'react'
import BodyView from './body/BodyView.jsx'
import Dashboard from './dashboard/Dashboard.jsx'
import DeviceSimulator from './live/DeviceSimulator.jsx'
import useLive from './live/useLive.js'
import EntryForm from './entry/EntryForm.jsx'
import GroundScreen from './ground/GroundScreen.jsx'

const Evidence = lazy(() => import('./evidence/Evidence.jsx'))

const TABS = [
  { id: 'status', label: 'Status' },
  { id: 'body', label: 'Body' },
  { id: 'log', label: 'Log a check' },
  { id: 'evidence', label: 'Evidence' },
]

function CrewApp() {
  const [health, setHealth] = useState('...')
  const [tab, setTab] = useState(() => {
    const fromHash = location.hash.slice(1)
    return TABS.some(t => t.id === fromHash) ? fromHash : 'status'
  })
  // a5: readings arrive live over SignalR (polling if the hub can't connect).
  // Both the Status and Body screens re-fetch whenever `tick` changes.
  const { tick } = useLive()
  const SCREENS = { status: <Dashboard reloadKey={tick} />, body: <BodyView reloadKey={tick} />, log: <EntryForm />,
    evidence: (
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <Evidence />
      </Suspense>
    ),
  }

  useEffect(() => {
    fetch('/api/health').then(r => r.text()).then(setHealth).catch(() => setHealth('down'))
  }, [])

  const choose = id => {
    setTab(id)
    history.replaceState(null, '', id === 'status' ? location.pathname : `#${id}`)
  }

  return (
    <div className="app">
      <header>
        <h1>AstroPulse</h1>
        <p>Astronaut health monitoring · NASA Space Apps Cairo 2026</p>
        <DeviceSimulator />
      </header>
      <nav className="tabs" role="tablist" aria-label="Screens">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tab on' : 'tab'}
            onClick={() => choose(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main>{SCREENS[tab]}</main>
      <footer>
        <small>
          API: {health} ·{' '}
          <a className="footer-link" href="#ground" target="_blank" rel="noreferrer">
            Ground control view
          </a>
        </small>
      </footer>
    </div>
  )
}

// #ground is the flight surgeon's screen: a separate page in the same site, with its own look.
export default function App() {
  const [ground, setGround] = useState(() => location.hash === '#ground')
  useEffect(() => {
    const onHash = () => setGround(location.hash === '#ground')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return ground ? <GroundScreen /> : <CrewApp />
}
