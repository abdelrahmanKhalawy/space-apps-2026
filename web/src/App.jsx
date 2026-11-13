import { lazy, Suspense, useEffect, useState } from 'react'
import BodyView from './body/BodyView.jsx'
import Dashboard from './dashboard/Dashboard.jsx'
import DeviceSimulator from './live/DeviceSimulator.jsx'
import CameraPulse from './live/CameraPulse.jsx'
import useLive from './live/useLive.js'
import useOutbox from './offline/useOutbox.js'
import EntryForm from './entry/EntryForm.jsx'
import GroundScreen from './ground/GroundScreen.jsx'

const Evidence = lazy(() => import('./evidence/Evidence.jsx'))
const CrewView = lazy(() => import('./crew/CrewView.jsx'))
const ChecksView = lazy(() => import('./checks/ChecksView.jsx'))

const TABS = [
  { id: 'status', label: 'Status' },
  { id: 'body', label: 'Body' },
  { id: 'log', label: 'Log a check' },
  { id: 'checks', label: 'Checks' },
  { id: 'crew', label: 'Crew' },
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
  const { tick, connected } = useLive()
  const { pending } = useOutbox()
  const SCREENS = { status: <Dashboard reloadKey={tick} />, body: <BodyView reloadKey={tick} />, log: <EntryForm />,
    checks: (
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <ChecksView />
      </Suspense>
    ),
    crew: (
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <CrewView />
      </Suspense>
    ),
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
    <div className="shell">
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M2 17h6l3-9 5 17 4-11 2 3h8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <h1>AstroPulse</h1>
              <p>Telemetry console</p>
            </div>
            <span className={connected ? 'live-pill on' : 'live-pill'} role="status" data-testid="live-pill">
              <span className="live-dot" aria-hidden="true" />
              {connected ? 'Live' : 'Updating every 2 s'}
            </span>
          </div>
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
        </div>
      </header>
      <div className="app">
        <div className="tools">
          <CameraPulse />
          <DeviceSimulator />
        </div>
        {pending > 0 && (
          <p className="notice" role="status">
            {pending} reading{pending === 1 ? '' : 's'} saved on this device, waiting for a connection.
          </p>
        )}
        <main>{SCREENS[tab]}</main>
        <footer>
          <p className="disclaimer">Decision support, not a diagnosis.</p>
          <small>
            API: {health} ·{' '}
            <a className="footer-link" href="#ground" target="_blank" rel="noreferrer">
              Ground control view
            </a>
          </small>
        </footer>
      </div>
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
