import { useCallback, useEffect, useState } from 'react'
import { CHANGED, flushOutbox, pendingCount } from './outbox.js'

/** Sends anything waiting in the outbox when the app opens, when the connection returns, and every 15 s while something waits. */
export default function useOutbox(onSent) {
  const [pending, setPending] = useState(() => pendingCount())

  const flush = useCallback(async () => {
    if (pendingCount() === 0) {
      setPending(0)
      return
    }
    const r = await flushOutbox()
    setPending(r.remaining)
    if (r.sent > 0) onSent?.()
  }, [onSent])

  useEffect(() => {
    flush()
    const timer = setInterval(() => {
      setPending(pendingCount())
      if (pendingCount() > 0) flush()
    }, 15000)
    const refresh = () => setPending(pendingCount())
    window.addEventListener('online', flush)
    window.addEventListener(CHANGED, refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', flush)
      window.removeEventListener(CHANGED, refresh)
    }
  }, [flush])

  return { pending, flush }
}
