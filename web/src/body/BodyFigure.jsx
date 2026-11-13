// A simple flat human figure. Each part is a button: it takes the color of the worst indicator behind it,
// and opens that part's indicators. Hand-drawn SVG, no 3D, no libraries.

const FILL = { green: '#3ddc84', yellow: '#ffcc4d', red: '#ff5d5d' }
const colorFor = color => FILL[color] ?? '#6b7699'

const SHAPES = {
  // Lungs: two lobes, one organ.
  lungs: [
    <ellipse key="l" cx="88" cy="128" rx="17" ry="30" />,
    <ellipse key="r" cx="132" cy="128" rx="17" ry="30" />,
  ],
  heart: [<path key="h" d="M110 170 C90 153 90 133 103 133 C107 133 110 136 110 139 C110 136 113 133 117 133 C130 133 130 153 110 170 Z" />],
  brain: [<ellipse key="b" cx="110" cy="38" rx="17" ry="14" />],
  metabolism: [<ellipse key="m" cx="110" cy="198" rx="23" ry="12" />],
}

// Where the camera goes when a part is picked: the point to center on (in the 220x400 drawing) and how far to zoom.
// Skin is the whole outline, so it stays at full size. r is the radius of the ring drawn around the part.
const FOCUS = {
  brain: { cx: 110, cy: 46, s: 2.9, r: 25 },
  lungs: { cx: 110, cy: 128, s: 2.5, r: 42 },
  heart: { cx: 110, cy: 152, s: 3.1, r: 27 },
  metabolism: { cx: 110, cy: 198, s: 3.2, r: 31 },
}
// Labels beside the body: y is where the line meets the part, x the edge of the part it starts from.
const CALLOUTS = [
  { id: 'brain', n: '01', y: 38, x: 128 },
  { id: 'lungs', n: '02', y: 118, x: 149 },
  { id: 'heart', n: '03', y: 152, x: 124 },
  { id: 'metabolism', n: '04', y: 198, x: 133 },
  { id: 'skin', n: '05', y: 246, x: 150 },
]
const FULL = 'translate(0px, 0px) scale(1)'
const cameraFor = id => {
  const f = FOCUS[id]
  return f ? `translate(${130 - f.s * f.cx}px, ${200 - f.s * f.cy}px) scale(${f.s})` : FULL
}

export default function BodyFigure({ organs, selected, pulsing, onSelect }) {
  const byId = Object.fromEntries(organs.map(o => [o.id, o]))
  const skin = byId.skin

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
      <g className="body-zoom" style={{ transform: cameraFor(selected) }}>
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
          fill="#1a2450"
          stroke={colorFor(skin.color)}
          strokeWidth="4"
          strokeLinejoin="round"
          className={pulsing.has('skin') ? 'pulse' : undefined}
        >
          <circle cx="110" cy="42" r="27" />
          <rect x="100" y="66" width="20" height="16" rx="4" />
          <path d="M68 84 Q110 72 152 84 L158 214 Q110 230 62 214 Z" />
          <path d="M68 88 C52 92 44 106 42 126 L34 196 C33 205 47 208 50 199 L63 130 L68 122 Z" />
          <path d="M152 88 C168 92 176 106 178 126 L186 196 C187 205 173 208 170 199 L157 130 L152 122 Z" />
          <path d="M66 214 L108 220 L104 372 Q104 388 90 388 Q77 388 77 372 Z" />
          <path d="M154 214 L112 220 L116 372 Q116 388 130 388 Q143 388 143 372 Z" />
        </g>
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
            fillOpacity="0.85"
            stroke="#0b1020"
            strokeWidth="2"
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
            <text x="214" y={c.y + 3.5}>{c.n} {byId[c.id].label.toUpperCase()}</text>
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
    </svg>
  )
}
