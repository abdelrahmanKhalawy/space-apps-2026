// Read advice out loud (Web Speech API): a crew member's hands are often busy, and a red alert is
// easier to follow when it is spoken. Works offline on most phones. Arabic text is read in Arabic.

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

/** Arabic letters present -> Egyptian Arabic, else English. */
export const langOf = text => (/[؀-ۿ]/.test(text) ? 'ar-EG' : 'en-US')

export function speak(text) {
  if (!canSpeak() || !text) return false
  window.speechSynthesis.cancel() // never stack two readings
  const u = new SpeechSynthesisUtterance(text)
  u.lang = langOf(text)
  u.rate = 0.95
  window.speechSynthesis.speak(u)
  return true
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel()
}
