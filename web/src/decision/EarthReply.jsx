import { useEffect, useRef, useState } from 'react'
import { formatCountdown } from './mission.js'
import SpeakButton from '../voice/SpeakButton.jsx'

const CREW_ID = 'crew-1'
// Slow poll (the server keeps a shared free-tier CPU budget, and most visitors never get a reply). A countdown that reaches zero
// asks right away, so the reply still appears on time.
const POLL_MS = 4000

/** The answer from the flight surgeon. It only shows up after the signal has crossed the gap back to the crew. */
export default function EarthReply() {
  const [data, setData] = useState({ replies: [], fetchedAt: 0 })
  const [now, setNow] = useState(() => Date.now())
  const loading = useRef(false)
  const latestRef = useRef(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (loading.current || document.hidden) return // a background tab doesn't poll
      loading.current = true
      try {
        const res = await fetch(`/api/replies?crewId=${CREW_ID}`)
        if (res.ok && alive) {
          const replies = await res.json()
          latestRef.current = { replies, fetchedAt: Date.now() }
          setData(latestRef.current)
        }
      } catch {
        /* no server: no reply card */
      } finally {
        loading.current = false
      }
    }
    load()
    const poll = setInterval(load, POLL_MS)
    const tick = setInterval(() => {
      const t = Date.now()
      setNow(t)
      const cur = latestRef.current
      const first = cur?.replies?.[0]
      if (first && first.status === 'in_transit' && first.secondsToDeliver - (t - cur.fetchedAt) / 1000 <= 0) load()
    }, 1000)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      alive = false
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [])

  const latest = data.replies[0]
  if (!latest) return null
  const left = latest.status === 'in_transit' ? Math.max(0, latest.secondsToDeliver - (now - data.fetchedAt) / 1000) : 0

  return (
    <section className={latest.status === 'arrived' ? 'earth earth-in' : 'earth earth-wait'} role="status" data-testid="earth-reply">
      {latest.status === 'arrived' ? (
        <>
          <strong>Reply from Earth</strong>
          <p dir="auto">{latest.text}</p>
          <SpeakButton text={latest.text} label="Read the reply aloud" />
          <small>Received {latest.deliverAt.slice(11, 19)} UTC</small>
        </>
      ) : (
        <>
          <strong>Earth has answered. The reply is on its way.</strong>
          <p>It reaches you in <strong>{formatCountdown(left)}</strong>.</p>
        </>
      )}
    </section>
  )
}
