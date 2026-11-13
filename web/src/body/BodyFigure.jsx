// The body map: a see-through neon "hologram" figure. Each part is a button: it takes the color of the worst
// indicator behind it, and opens that part's indicators. Hand-drawn SVG, no 3D, no libraries.
// Picking a part flies a camera to it: an arc with a little sideways sway and tilt, then a slow drift,
// like a film shot (Web Animations API, nothing to install).
import { useEffect, useRef } from 'react'

const FILL = { green: '#3ddc84', yellow: '#ffcc4d', red: '#ff5d5d' }
const colorFor = color => FILL[color] ?? '#6b7699'

const SHAPES = {
  // Lungs: two lobes, one organ.
  lungs: [
    <ellipse key="l" cx="91" cy="124" rx="15" ry="28" />,
    <ellipse key="r" cx="129" cy="124" rx="15" ry="28" />,
  ],
  heart: [<path key="h" d="M110 168 C91 152 91 133 103 133 C107 133 110 136 110 139 C110 136 113 133 117 133 C129 133 129 152 110 168 Z" />],
  brain: [<ellipse key="b" cx="110" cy="37" rx="15" ry="12" />],
  metabolism: [<ellipse key="m" cx="110" cy="198" rx="21" ry="11" />],
}

// Where the camera goes when a part is picked: the point to center on (in the 220x400 drawing) and how far to zoom.
// Skin is the whole outline, so it stays at full size. r is the radius of the ring drawn around the part.
const FOCUS = {
  brain: { cx: 110, cy: 38, s: 3.0, r: 22 },
  lungs: { cx: 110, cy: 124, s: 2.5, r: 40 },
  heart: { cx: 110, cy: 150, s: 3.1, r: 25 },
  metabolism: { cx: 110, cy: 198, s: 3.2, r: 28 },
}
// Labels beside the body: y is where the line meets the part, x the edge of the part it starts from.
const CALLOUTS = [
  { id: 'brain', n: '01', y: 37, x: 125 },
  { id: 'lungs', n: '02', y: 112, x: 144 },
  { id: 'heart', n: '03', y: 152, x: 122 },
  { id: 'metabolism', n: '04', y: 198, x: 131 },
  { id: 'skin', n: '05', y: 270, x: 153 },
]

// One closed outline: head, neck, shoulders, arms held slightly away from the body, torso, legs.
// The right half mirrors the left.
const BODY_PATH =
  'M110 15 C97 15 89 26 89 40 C89 50 94 58 101 62 L100 76 C92 80 80 82 70 86 C60 89 53 97 51 110 C49 128 44 146 40 162 C37 176 33 192 29 208 C27 214 25 222 27 230 C30 236 37 234 38 228 C41 214 46 196 50 180 C53 166 58 146 64 118 C66 140 74 165 76 190 C76 205 68 218 68 236 C66 265 68 290 72 312 C74 330 70 340 72 352 C74 364 76 372 77 380 C77 388 70 391 68 393 L98 393 C102 393 102 386 101 378 C100 350 105 290 110 250 C115 290 120 350 119 378 C118 386 118 393 122 393 L152 393 C150 391 143 388 143 380 C144 372 146 364 148 352 C150 340 146 330 148 312 C152 290 154 265 152 236 C152 218 144 205 144 190 C146 165 154 140 156 118 C162 146 167 166 170 180 C174 196 179 214 182 228 C183 234 190 236 193 230 C195 222 193 214 191 208 C187 192 183 176 180 162 C176 146 171 128 169 110 C167 97 160 89 150 86 C140 82 128 80 120 76 L119 62 C126 58 131 50 131 40 C131 26 123 15 110 15 Z'
const CONTOURS = 'M-10 26 Q110 35 230 26 M-10 42 Q110 51 230 42 M-10 58 Q110 67 230 58 M-10 74 Q110 83 230 74 M-10 90 Q110 99 230 90 M-10 106 Q110 115 230 106 M-10 122 Q110 131 230 122 M-10 138 Q110 147 230 138 M-10 154 Q110 163 230 154 M-10 170 Q110 179 230 170 M-10 186 Q110 195 230 186 M-10 202 Q110 211 230 202 M-10 218 Q110 227 230 218 M-10 234 Q110 243 230 234 M-10 250 Q110 259 230 250 M-10 266 Q110 275 230 266 M-10 282 Q110 291 230 282 M-10 298 Q110 307 230 298 M-10 314 Q110 323 230 314 M-10 330 Q110 339 230 330 M-10 346 Q110 355 230 346 M-10 362 Q110 371 230 362 M-10 378 Q110 387 230 378 M-10 394 Q110 403 230 394'

// The camera is a translate+scale of the whole drawing, centered on (130, 200) in drawing units.
const camera = id => {
  const f = FOCUS[id]
  return f ? { x: 130 - f.s * f.cx, y: 200 - f.s * f.cy, s: f.s } : { x: 0, y: 0, s: 1 }
}
const css = c => `translate(${c.x}px, ${c.y}px) scale(${c.s})`
const MOVE_MS = 1600

export default function BodyFigure({ organs, selected, pulsing, onSelect }) {
  const byId = Object.fromEntries(organs.map(o => [o.id, o]))
  const skin = byId.skin
  const zoomRef = useRef(null)
  const lastCam = useRef(camera(null))
  const lastAnim = useRef(null)
  const side = useRef(1)

  // Cinematic move: from the old camera to the new one along an arc. Halfway there the shot is pulled back a
  // touch, swung sideways and tilted; the side flips on every move so it never feels mechanical.
  useEffect(() => {
    const from = lastCam.current
    const to = camera(selected)
    lastCam.current = to
    const el = zoomRef.current
    if (!el || (from.x === to.x && from.y === to.y && from.s === to.s)) return
    if (typeof el.animate !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    lastAnim.current?.cancel()
    side.current *= -1
    const swing = 34 * side.current
    const tilt = -2 * side.current
    const mid = { x: (from.x + to.x) / 2 + swing, y: (from.y + to.y) / 2, s: ((from.s + to.s) / 2) * 0.92 }
    lastAnim.current = el.animate(
      [
        { transform: css(from) },
        { transform: `translate(130px, 200px) rotate(${tilt}deg) translate(-130px, -200px) ${css(mid)}`, offset: 0.5 },
        { transform: css(to) },
      ],
      { duration: MOVE_MS, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' },
    )
  }, [selected])

  const pick = id => () => onSelect(id)
  const onKey = id => e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(id)
    }
  }
  const label = o => `${o.label}: ${o.color ? o.color : 'no readings'}. Show details.`

  return (
    <svg
      viewBox="-40 0 340 400"
      className={`body-svg${FOCUS[selected] ? ' zoomed' : ''}`}
      role="group"
      aria-label="Body status. Pick a part for details."
    >
      <defs>
        <pattern id="body-mesh" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="#6ea8ff" />
        </pattern>
        <clipPath id="body-clip">
          <path d={BODY_PATH} />
        </clipPath>
        <linearGradient id="body-scan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6ea8ff" stopOpacity="0" />
          <stop offset="1" stopColor="#6ea8ff" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <g className="body-zoom" ref={zoomRef} style={{ transform: css(camera(selected)) }}>
        <g className="body-drift">
          {/* Skin = the whole body outline */}
          <g
            className={`part part-skin${selected === 'skin' ? ' sel' : ''}${FOCUS[selected] ? ' dim' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={label(skin)}
            aria-pressed={selected === 'skin'}
            data-testid="organ-skin"
            data-color={skin.color ?? 'none'}
            onClick={pick('skin')}
            onKeyDown={onKey('skin')}
          >
            <g
              fill="rgba(110,168,255,0.07)"
              stroke={colorFor(skin.color)}
              strokeWidth="1.8"
              strokeLinejoin="round"
              className={pulsing.has('skin') ? 'pulse' : undefined}
            >
              <path d={BODY_PATH} />
            </g>
          </g>

          <g clipPath="url(#body-clip)" className="holo" aria-hidden="true">
            <rect x="0" y="0" width="220" height="400" fill="url(#body-mesh)" opacity="0.3" />
            <path d={CONTOURS} className="contours" />
            <rect x="0" y="-40" width="220" height="40" fill="url(#body-scan)" className="scan" />
          </g>

          {/* Faint anatomy hints (collarbones, spine, ribs) so the figure reads as a body, not a toy */}
          <g className="anatomy" aria-hidden="true">
            <path d="M88 84 Q99 90 109 86 M132 84 Q121 90 111 86" />
            <path d="M110 92 V222" strokeDasharray="2 4" />
            <path d="M84 102 Q110 114 136 102 M82 116 Q110 130 138 116 M84 130 Q110 144 136 130 M88 144 Q110 154 132 144" />
          </g>

          {Object.entries(SHAPES).map(([id, shapes]) => {
            const o = byId[id]
            return (
              <g
                key={id}
                className={`part part-${id}${selected === id ? ' sel' : ''}${pulsing.has(id) ? ' pulse' : ''}${FOCUS[selected] && selected !== id ? ' dim' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={label(o)}
                aria-pressed={selected === id}
                data-testid={`organ-${id}`}
                data-color={o.color ?? 'none'}
                fill={colorFor(o.color)}
                fillOpacity="0.4"
                stroke={colorFor(o.color)}
                strokeWidth="1.6"
                style={{ color: colorFor(o.color) }}
                onClick={pick(id)}
                onKeyDown={onKey(id)}
              >
                {shapes}
              </g>
            )
          })}

          <g className="callouts" aria-hidden="true">
            {CALLOUTS.map(c => (
              <g key={c.id} className={`callout callout-${byId[c.id].color ?? 'none'}`}>
                <polyline points={`${c.x},${c.y} 196,${c.y} 204,${c.y}`} />
                <circle cx="206" cy={c.y} r="3" />
                <text x="214" y={c.y + 3.5}>
                  {c.n} {byId[c.id].label.toUpperCase()}
                </text>
              </g>
            ))}
          </g>

          {FOCUS[selected] && (
            <g className="focus-ring" aria-hidden="true" stroke={colorFor(byId[selected]?.color)}>
              <circle cx={FOCUS[selected].cx} cy={FOCUS[selected].cy} r={FOCUS[selected].r} className="ring-dash" />
              <circle cx={FOCUS[selected].cx} cy={FOCUS[selected].cy} r={FOCUS[selected].r} className="ring-ping" />
            </g>
          )}
        </g>
      </g>
    </svg>
  )
}
