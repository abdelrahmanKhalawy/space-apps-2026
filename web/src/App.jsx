import { useEffect, useState } from 'react'
import Dashboard from './dashboard/Dashboard.jsx'
import EntryForm from './entry/EntryForm.jsx'

const TABS = [
  { id: 'status', label: 'Status' },
  { id: 'log', label: 'Log a check' },
]

export default function App() {
  const [health, setHealth] = useState('...')
  const [tab, setTab] = useState(() => (location.hash === '#log' ? 'log' : 'status'))

  useEffect(() => {
    fetch('/api/health').then(r => r.text()).then(setHealth).catch(() => setHealth('down'))
  }, [])

  const choose = id => {
    setTab(id)
    history.replaceState(null, '', id === 'log' ? '#log' : location.pathname)
  }

  return (
    <div className="app">
      <header>
        <h1>Space Monkeys</h1>
        <p>Astronaut health monitoring · NASA Space Apps Cairo 2026</p>
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
      <main>{tab === 'status' ? <Dashboard /> : <EntryForm />}</main>
      <footer>
        <small>API: {health}</small>
      </footer>
    </div>
  )
}
