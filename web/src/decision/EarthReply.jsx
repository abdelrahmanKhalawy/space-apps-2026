import { useEffect, useRef, useState } from 'react'
import { formatCountdown } from './mission.js'
import SpeakButton from '../voice/SpeakButton.jsx'

const CREW_ID = 'crew-1'
const POLL_MS = 2000

/** The answer from the flight surgeon. It only shows up after the signal has crossed the gap back to the crew. */
export default function EarthReply() {
  const [data, setData] = useState({ replies: [], fetchedAt: 0 })
  const [now, setNow] = useState(() => Date.now())
  const loading = useRef(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (loading.current) return
      loading.current = true
      try {
        const res = await fetch(`/api/replies?crewId=${CREW_ID}`)
        if (res.ok && alive) setData({ replies: await res.json(), fetchedAt: Date.now() })
      } catch {
        /* no server: no reply card */
      } finally {
        loading.current = false
      }
    }
    load()
    const poll = setInterval(load, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
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
