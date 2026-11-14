// Display preferences: high contrast (a toggle in the Privacy panel, remembered on this device).
// Reduced motion needs no code: the stylesheet follows the system's "reduce motion" setting.
const KEY = 'astropulse.contrast'

export const isHighContrast = () => {
  try { return localStorage.getItem(KEY) === 'high' } catch { return false }
}

export function setHighContrast(on) {
  try { localStorage.setItem(KEY, on ? 'high' : 'normal') } catch { /* private window */ }
  document.documentElement.classList.toggle('hc', on)
}

/** Call once at start-up. */
export const applyStoredContrast = () => document.documentElement.classList.toggle('hc', isHighContrast())
