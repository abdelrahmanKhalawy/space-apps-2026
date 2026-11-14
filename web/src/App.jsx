import { lazy, Suspense, useEffect, useState } from 'react'
import BodyView from './body/BodyView.jsx'
import Dashboard from './dashboard/Dashboard.jsx'
import DeviceSimulator from './live/DeviceSimulator.jsx'
import CameraPulse from './live/CameraPulse.jsx'
import useLive from './live/useLive.js'
import useOutbox from './offline/useOutbox.js'
import Tour from './tour/Tour.jsx'
import PageHelp from './help/PageHelp.jsx'
import BrandMark from './brand/BrandMark.jsx'
import { getLang, setLang, useLang } from './i18n/lang.js'
import EntryForm from './entry/EntryForm.jsx'
import GroundScreen from './ground/GroundScreen.jsx'

const Evidence = lazy(() => import('./evidence/Evidence.jsx'))
const ReplayView = lazy(() => import('./replay/ReplayView.jsx'))
const ImportView = lazy(() => import('./import/ImportView.jsx'))
const CrewView = lazy(() => import('./crew/CrewView.jsx'))
const ChecksView = lazy(() => import('./checks/ChecksView.jsx'))

const TABS = [
  { id: 'status', label: 'Status' },
  { id: 'body', label: 'Body' },
  { id: 'log', label: 'Log vitals' },
  { id: 'checks', label: 'Quick tests' },
  { id: 'replay', label: 'Replay' },
  { id: 'yourdata', label: 'Your data' },
  { id: 'crew', label: 'Whole crew' },
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
  const lang = useLang() // the advice language: changing it reloads the screens that show advice
  const SCREENS = { status: <Dashboard reloadKey={`${tick}-${lang}`} />, body: <BodyView reloadKey={`${tick}-${lang}`} />, log: <EntryForm />,
    checks: (
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <ChecksView />
      </Suspense>
    ),
    yourdata: (
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <ImportView />
      </Suspense>
    ),
    replay: (
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <ReplayView />
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

  // The tour (and any #link) can switch screens by changing the hash.
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1)
      if (TABS.some(t => t.id === h)) setTab(h)
      else if (h === '') setTab('status')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // On a phone the tab strip scrolls sideways: keep the current tab in view (the tour changes tabs for you)
  useEffect(() => {
    document.querySelector('.tab.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tab])

  const choose = id => {
    setTab(id)
    history.replaceState(null, '', id === 'status' ? location.pathname : `#${id}`)
  }

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <BrandMark className="brand-mark" />
            <div>
              <h1>Astro<span>Pulse</span></h1>
              <p>Telemetry console</p>
            </div>
            <span className={connected ? 'live-pill on' : 'live-pill'} role="status" data-testid="live-pill">
              <span className="live-dot" aria-hidden="true" />
              {connected ? 'Live' : 'Auto-refresh'}
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
        <Tour showAgain={tab === 'status'} onGo={id => { location.hash = id === 'status' ? '' : id; if (id === 'status') history.replaceState(null, '', location.pathname); setTab(id) }} />
        {['status', 'body', 'log'].includes(tab) && (
          <div className="tools">
            <CameraPulse />
            <DeviceSimulator />
            {tab !== 'log' && (
              <button type="button" className="lang-btn" onClick={() => setLang(getLang() === 'ar' ? 'en' : 'ar')} aria-pressed={lang === 'ar'}
                title="Language of the advice texts">
                {lang === 'ar' ? 'Advice: العربية' : 'Advice: English'}
              </button>
            )}
          </div>
        )}
        {pending > 0 && (
          <p className="notice" role="status">
            {pending} reading{pending === 1 ? '' : 's'} saved on this device, waiting for a connection.
          </p>
        )}
        <main id="main" tabIndex="-1">
          <PageHelp tab={tab} key={tab} />
          {SCREENS[tab]}
        </main>
        <footer>
          <p className="disclaimer">Decision support, not a diagnosis.</p>
          <small>
            {health !== 'ok' && health !== '...' && <>Server: {health} · </>}
            <a className="footer-link" href="#ground" target="_blank" rel="noreferrer">
              Open the flight surgeon's screen
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
