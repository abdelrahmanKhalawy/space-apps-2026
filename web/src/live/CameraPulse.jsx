import { useEffect, useRef, useState } from 'react'
import { analyzeBest, fingerOnLens } from './ppg.js'

const CREW_ID = 'crew-1'
const SETTLE_MS = 3000 // auto-exposure needs a moment, so the first seconds are thrown away
const MEASURE_MS = 25000
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

// Why the camera can't be used, in words a judge can act on.
function explain(err) {
  if (!window.isSecureContext) return 'The camera only works on https or localhost.'
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser has no camera access.'
  if (err?.name === 'NotAllowedError') return 'Camera permission was refused. Allow it in the browser and try again.'
  if (err?.name === 'NotFoundError') return 'No camera found on this device.'
  return 'Could not start the camera.'
}

function Wave({ points }) {
  if (points.length < 2) return null
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const d = points
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * 300).toFixed(1)} ${(30 - ((v - lo) / (hi - lo || 1)) * 28).toFixed(1)}`)
    .join(' ')
  return (
    <svg viewBox="0 0 300 32" className="cam-wave" aria-hidden="true">
      <path d={d} fill="none" stroke="#ff5d5d" strokeWidth="1.5" />
    </svg>
  )
}

/** Put a fingertip on the phone's camera: heart rate (and a rough HRV) from the light passing through the skin.
 * An experiment, not a medical device. The simulator button stays as the fallback. */
export default function CameraPulse({ onUse = null, buttonLabel = 'Measure my pulse with the phone camera' }) {
  const [phase, setPhase] = useState('idle') // idle | starting | measuring | done | error
  const [msg, setMsg] = useState('')
  const [progress, setProgress] = useState(0)
  const [finger, setFinger] = useState(false)
  const [wave, setWave] = useState([])
  const [result, setResult] = useState(null)
  const [sent, setSent] = useState(null)
  const video = useRef(null)
  const stream = useRef(null)
  const timer = useRef(null)

  const stop = () => {
    clearInterval(timer.current)
    timer.current = null
    stream.current?.getTracks().forEach(t => t.stop())
    stream.current = null
  }
  useEffect(() => stop, [])

  const start = async () => {
    setSent(null)
    setResult(null)
    setWave([])
    setProgress(0)
    setPhase('starting')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 160 }, height: { ideal: 120 }, frameRate: { ideal: 30 } },
        audio: false,
      })
    } catch (err) {
      setMsg(explain(err))
      setPhase('error')
      return
    }
    const track = stream.current.getVideoTracks()[0]
    // The torch lights the fingertip evenly. Not every phone or browser lets a web page turn it on.
    try {
      if (track.getCapabilities?.().torch) await track.applyConstraints({ advanced: [{ torch: true }] })
    } catch {
      /* carry on with ambient light */
    }
    const v = video.current
    v.srcObject = stream.current
    await v.play().catch(() => {})

    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const samples = []
    const startedAt = performance.now()
    let fingerFrames = 0
    let frames = 0
    setPhase('measuring')

    timer.current = setInterval(() => {
      const now = performance.now()
      const elapsed = now - startedAt
      ctx.drawImage(v, 0, 0, 16, 16)
      const px = ctx.getImageData(0, 0, 16, 16).data
      let r = 0, g = 0, b = 0
      for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2] }
      const n = px.length / 4
      const c = { r: r / n, g: g / n, b: b / n }
      const on = fingerOnLens(c)
      setFinger(on)
      if (elapsed < SETTLE_MS) { setProgress(0); return }
      frames++
      if (on) fingerFrames++
      samples.push({ t: now, r: c.r, g: c.g, b: c.b })
      setProgress(Math.min(1, (elapsed - SETTLE_MS) / MEASURE_MS))
      // live waveform: red, unless red is clipped (then green carries the pulse)
      if (samples.length % 3 === 0) setWave(samples.slice(-150).map(s => (c.r >= 250 ? s.g : s.r)))
      if (elapsed >= SETTLE_MS + MEASURE_MS) {
        stop()
        const res = analyzeBest(samples)
        const covered = frames ? fingerFrames / frames : 0
        setResult({ ...res, covered })
        setPhase('done')
      }
    }, 33)
  }

  const cancel = () => {
    stop()
    setPhase('idle')
  }

  const good = result && result.quality === 'good' && result.covered >= 0.8
  const send = async () => {
    // The dashboard shows each metric's newest reading BY TIME, so never send one older than the newest on the server.
    let newest = 0
    try {
      const st = await (await fetch(`/api/status?crewId=${CREW_ID}`)).json()
      newest = Math.max(0, ...(st.metrics ?? []).filter(m => m.metric === 'heart_rate').map(m => Date.parse(m.takenAt)))
    } catch { /* no status: the clock is enough */ }
    const takenAt = Math.max(Date.now(), newest + 1000)
    try {
      const res = await fetch('/api/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ crewId: CREW_ID, metric: 'heart_rate', value: result.bpm, unit: 'bpm', takenAt: iso(takenAt), source: 'camera' }]),
      })
      setSent(res.ok ? 'ok' : 'fail')
    } catch {
      setSent('fail')
    }
  }

  return (
    <div className="cam">
      {phase === 'idle' && (
        <button type="button" className="cam-btn" onClick={start}>{buttonLabel}</button>
      )}
      {phase !== 'idle' && (
        <div className="cam-panel" role="region" aria-label="Camera pulse measurement">
          <video ref={video} playsInline muted className="cam-video" />
          {phase === 'starting' && <p className="hint">Starting the camera…</p>}
          {phase === 'error' && (
            <>
              <p className="cam-error">{msg}</p>
              <p className="hint">The “Simulate readings” button works everywhere.</p>
              <button type="button" className="cam-link" onClick={cancel}>Close</button>
            </>
          )}
          {phase === 'measuring' && (
            <>
              <p className="cam-step">
                {finger ? 'Hold still. Keep your fingertip fully over the camera lens.' : 'Cover the camera lens (and the flash) completely with your fingertip.'}
              </p>
              <div className="cam-bar" aria-hidden="true"><div style={{ width: `${progress * 100}%` }} /></div>
              <Wave points={wave} />
              <button type="button" className="cam-link" onClick={cancel}>Cancel</button>
            </>
          )}
          {phase === 'done' && result && (
            <>
              {good ? (
                <>
                  <p className="cam-result"><strong>{result.bpm}</strong> bpm{result.rmssd != null && <span> · HRV {result.rmssd} ms (rough)</span>}</p>
                  <p className="hint">Measured from {result.beats} heartbeats through your fingertip. Experimental, ±a few bpm. Not a medical measurement.</p>
                  {onUse ? (
                    <button type="button" className="ev-btn" onClick={() => { onUse(result.bpm); cancel() }}>Use this value</button>
                  ) : sent === 'ok' ? <p className="cam-ok">Sent. It now shows on the dashboard and the body.</p> : (
                    <button type="button" className="ev-btn" onClick={send}>Send as my heart rate</button>
                  )}
                  {sent === 'fail' && <p className="cam-error">Could not reach the server.</p>}
                </>
              ) : (
                <p className="cam-error">
                  {result.covered < 0.8 ? 'Your finger moved off the lens.' : 'The signal was too weak or noisy.'} Press a little firmer, keep still, and try again.
                </p>
              )}
              <button type="button" className="cam-link" onClick={start}>Measure again</button>{' '}
              <button type="button" className="cam-link" onClick={cancel}>Close</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
