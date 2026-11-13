// The body map: a 3D hologram of a person on a canvas (model.js builds it, camera3d.js is the camera,
// render3d.js draws it). Pick a part and the camera flies to it. Drag to turn the body around.
// The buttons under the figure (BodyView) do the same picking for keyboards and screen readers.
import { useEffect, useRef } from 'react'
import { createBodyRenderer } from './render3d.js'

export default function BodyFigure({ organs, selected, pulsing, onSelect }) {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const renderer = createBodyRenderer(canvasRef.current, { onSelect: id => onSelectRef.current(id) })
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
        aria-label={`3D body model. ${summary}. Use the buttons below to pick a part.`}
        data-testid="body-canvas"
      />
    </div>
  )
}
