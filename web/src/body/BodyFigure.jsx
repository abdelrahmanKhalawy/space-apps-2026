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
    <svg viewBox="0 0 220 400" className="body-svg" role="group" aria-label="Body status. Pick a part for details.">
      {/* Skin = the whole body outline */}
      <g
        className={`part part-skin${selected === 'skin' ? ' sel' : ''}`}
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
            className={`part part-${id}${selected === id ? ' sel' : ''}${pulsing.has(id) ? ' pulse' : ''}`}
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
    </svg>
  )
}
