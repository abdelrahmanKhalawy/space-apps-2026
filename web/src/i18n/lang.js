import { useEffect, useState } from 'react'

// The language of the ADVICE texts (what to do), which is the part a crew member acts on: English or Egyptian Arabic.
// The server returns either (GET /api/status?lang=ar). The rest of the interface stays English.
const KEY = 'astropulse.lang'
const EVENT = 'astropulse-lang'

export const getLang = () => {
  try {
    return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en'
  } catch {
    return 'en'
  }
}

export function setLang(lang) {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    /* private window: the choice just won't be remembered */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** "&lang=ar" for the API when Arabic is chosen, else "" (English is the default). */
export const langQuery = () => (getLang() === 'ar' ? '&lang=ar' : '')

export function useLang() {
  const [lang, set] = useState(getLang)
  useEffect(() => {
    const on = () => set(getLang())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return lang
}
