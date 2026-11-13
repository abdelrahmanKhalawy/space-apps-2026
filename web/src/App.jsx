import { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState('...')
  useEffect(() => {
    fetch('/api/health').then(r => r.text()).then(setHealth).catch(() => setHealth('down'))
  }, [])
  return (
    <main style={{ fontFamily: 'sans-serif', textAlign: 'center', marginTop: '20vh' }}>
      <h1>Space Monkeys</h1>
      <p>Astronaut health monitoring · NASA Space Apps Cairo 2026</p>
      <small>API: {health}</small>
    </main>
  )
}
