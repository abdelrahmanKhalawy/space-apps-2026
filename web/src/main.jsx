import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import { applyStoredContrast } from './a11y.js'

applyStoredContrast()

createRoot(document.getElementById('root')).render(<App />)

// Offline support: the service worker keeps the app and the last data available when the link drops.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
