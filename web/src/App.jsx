import { useEffect, useState } from 'react'
import EntryForm from './entry/EntryForm.jsx'

export default function App() {
  const [health, setHealth] = useState('...')
  useEffect(() => {
    fetch('/api/health').then(r => r.text()).then(setHealth).catch(() => setHealth('down'))
  }, [])
  return (
    <div className="app">
      <header>
        <h1>Space Monkeys</h1>
        <p>Astronaut health monitoring · NASA Space Apps Cairo 2026</p>
      </header>
      <main>
        <EntryForm />
      </main>
      <footer>
        <small>API: {health}</small>
      </footer>
    </div>
  )
}
