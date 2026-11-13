import { useState } from 'react'
import { GROUPS, loadConsent, saveConsent } from './consent.js'

/** What Earth may see in reports. Defaults to everything. A red alert is always sent. */
export default function PrivacyPanel() {
  const [consent, setConsent] = useState(loadConsent)
  const toggle = g => {
    const next = { ...consent, [g]: !consent[g] }
    setConsent(next)
    saveConsent(next)
  }
  return (
    <details className="priv">
      <summary>Privacy: what Earth can see</summary>
      <p className="hint">Choose which groups of indicators go into reports to the ground. A <strong>red alert is always sent</strong>, so the flight surgeon knows something is wrong. Only the details are held back.</p>
      {Object.entries(GROUPS).map(([g, info]) => (
        <label key={g} className="priv-row">
          <input type="checkbox" checked={consent[g]} onChange={() => toggle(g)} />
          <span>Share {info.label.toLowerCase()}</span>
        </label>
      ))}
    </details>
  )
}
