// The body map: the Stitch hologram picture on a canvas (holo.js is the camera, renderHolo.js draws it and adds the
// live layer on top). Pick a part and the camera flies to it. The buttons under the figure (BodyView) do the same
// picking for keyboards and screen readers.
import { useEffect, useRef } from 'react'
import { createHoloRenderer } from './renderHolo.js'

export default function BodyFigure({ organs, selected, pulsing, onSelect }) {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const renderer = createHoloRenderer(canvasRef.current, { onSelect: id => onSelectRef.current(id) })
    rendererRef.current = renderer
    return () => renderer.destroy()
  }, [])

  useEffect(() => {
    rendererRef.current?.update({ organs, selected, pulsing })
  })

  const summary = organs.map(o => `${o.label}: ${o.color ?? 'no readings'}`).join('. ')

  return (
    <div className="body-stage">
      <canvas
        ref={canvasRef}
        className="body-canvas"
        role="img"
        aria-label={`Body hologram. ${summary}. Use the buttons below to pick a part.`}
        data-testid="body-canvas"
      />
    </div>
  )
}
