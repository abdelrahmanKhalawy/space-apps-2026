// The AstroPulse mark: an orbit ring, a heartbeat line crossing it, and a small sun.
// Same shapes as docs/brand/logo-mark.svg (the source of truth: change it there and in docs/brand/make_logo.py, then here).
export default function BrandMark({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <defs>
    <linearGradient id="bm-ring" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#2f7df6"/><stop offset="1" stopColor="#6ea8ff"/></linearGradient>
    <linearGradient id="bm-sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd76a"/><stop offset="1" stopColor="#ff9f2e"/></linearGradient>
  </defs>
  <path d="M21.86 87.30 A47.0 33.5 -20.0 1 0 94.21 36.07" fill="none" stroke="url(#bm-ring)" strokeWidth="6.4" strokeLinecap="round"/>
  <path d="M30.88 48.82 A47.0 33.5 -20.0 0 1 91.75 34.95" fill="none" stroke="#6ea8ff" strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round"/>
  <path d="M4 76 L40 65.6 L40 70.8 Z" fill="#eaf1ff"/>
  <path d="M40 68.2 L46 66.8 L51 56 L58 83 L67 40 L75 70 L84 60 L95 49" fill="none" stroke="#eaf1ff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round"/>
  <path d="M90 50 L100 42" fill="none" stroke="#eaf1ff" strokeWidth="2" strokeLinecap="round"/>
  <circle cx="94.21" cy="36.07" r="7.4" fill="url(#bm-sun)"/>
    </svg>
  )
}
