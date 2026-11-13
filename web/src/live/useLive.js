import { useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'

/**
 * Bumps a counter every time a new reading should make the dashboard reload:
 * - on every "reading" event from the SignalR hub (contracts/api.md: /hubs/readings), or
 * - every 2s, if the hub never managed to connect (fallback from a5's brief).
 *
 * The caller doesn't need the reading itself — it just refetches /api/status and
 * /api/readings, which is simple, always correct, and fast enough for this app's size.
 */
export default function useLive() {
  const [tick, setTick] = useState(0)
  const [connected, setConnected] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => {
    let stopped = false
    const bump = () => !stopped && setTick(t => t + 1)

    const startPolling = () => {
      if (pollRef.current) return
      pollRef.current = setInterval(bump, 2000)
    }
    const stopPolling = () => {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/readings')
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    connection.on('reading', bump)
    connection.onreconnected(() => {
      if (stopped) return
      setConnected(true)
      stopPolling() // the hub is back, no need to poll alongside it
      bump() // catch up on anything missed while disconnected
    })
    connection.onreconnecting(() => !stopped && setConnected(false))
    connection.onclose(() => {
      if (stopped) return
      setConnected(false)
      startPolling() // SignalR gave up entirely — keep the screen moving by polling
    })

    connection
      .start()
      .then(() => !stopped && setConnected(true))
      .catch(() => !stopped && startPolling()) // couldn't even connect once — poll from the start

    return () => {
      stopped = true
      stopPolling()
      connection.stop()
    }
  }, [])

  return { tick, connected }
}
