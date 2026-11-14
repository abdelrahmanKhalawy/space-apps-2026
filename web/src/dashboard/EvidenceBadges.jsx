import { EVIDENCE, LEVELS } from './evidence.js'

/** "How sure are we?": where the colors come from and how solid the space-hazard link is. */
export default function EvidenceBadges({ metric }) {
  const e = EVIDENCE[metric]
  if (!e) return null
  const rows = [
    ['Color ranges', e.range],
    ['Space link', e.link],
  ]
  return (
    <div className="ebadges" onClick={ev => ev.stopPropagation()}>
      <p className="ebadges-head">How sure are we?</p>
      {rows.map(([name, r]) => (
        <p key={name} className="ebadge-row">
          <span className={`ebadge ebadge-${r.level}`} title={LEVELS[r.level].hint}>{LEVELS[r.level].label}</span>
          <span><strong>{name}.</strong> {r.note}</span>
        </p>
      ))}
    </div>
  )
}
