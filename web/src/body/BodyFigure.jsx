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
  { id: 'skin', n: '05', y: 246, x: 154 },
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
      <defs>
        <linearGradient id="body-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#223070" />
          <stop offset="1" stopColor="#111a3c" />
        </linearGradient>
      </defs>
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
          <path d="M100 64 L98 80 C88 81 74 84 64 92 C54 98 50 108 48 124 C45 148 40 172 37 192 C35 202 33 208 36 213 C40 218 48 214 49 206 C53 186 58 160 62 140 C64 134 66 130 67 126 C66 150 68 180 70 205 C66 218 64 232 66 250 C67 290 70 325 73 355 L74 372 C74 382 70 388 72 392 L98 392 C101 392 103 386 103 378 C103 340 107 290 110 242 C113 290 117 340 117 378 C117 386 119 392 122 392 L148 392 C150 388 146 382 146 372 L147 355 C150 325 153 290 154 250 C156 232 154 218 150 205 C152 180 154 150 153 126 C154 130 156 134 158 140 C162 160 167 186 171 206 C172 214 180 218 184 213 C187 208 185 202 183 192 C180 172 175 148 172 124 C170 108 166 98 156 92 C146 84 132 81 122 80 L120 64 Z" fill="url(#body-fill)" />
          <ellipse cx="110" cy="42" rx="23" ry="27" fill="url(#body-fill)" />
        </g>
      </g>

      {/* Faint anatomy hints (collarbones, spine, ribs) so the figure reads as a body, not a toy */}
      <g className="anatomy" aria-hidden="true">
        <path d="M84 92 Q98 98 108 94 M136 92 Q122 98 112 94" />
        <path d="M110 96 V216" strokeDasharray="2 4" />
        <path d="M82 108 Q110 120 138 108 M80 122 Q110 136 140 122 M82 136 Q110 148 138 136 M86 150 Q110 160 134 150" />
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
