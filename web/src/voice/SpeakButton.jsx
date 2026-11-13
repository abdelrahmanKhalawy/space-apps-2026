import { canSpeak, speak } from './speak.js'

/** A small "read aloud" button. Renders nothing when the browser can't speak. */
export default function SpeakButton({ text, label = 'Read aloud' }) {
  if (!canSpeak() || !text) return null
  return (
    <button
      type="button"
      className="speak"
      aria-label={label}
      onClick={e => {
        e.stopPropagation() // inside clickable cards: don't also toggle the card
        speak(text)
      }}
    >
      🔊 {label}
    </button>
  )
}
