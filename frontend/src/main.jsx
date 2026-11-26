import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles/global.css'
import { captureAttribution } from './services/attribution.js'

// Where this visitor came from (ad, search, direct…), for the sales report.
// Staff pages are not visits.
if (!/^\/(warehouse|admin)/.test(window.location.pathname)) captureAttribution()

// The main stylesheet no longer blocks the first paint (scripts/prerender-head.mjs makes it load in the background),
// so the page shows its first headline at once (LCP, 26 Nov 2026). The app starts only once that stylesheet is in,
// so nothing is ever drawn unstyled; 3 s at most.
function mainCssReady() {
  const link = document.querySelector('link[data-main-css]')
  if (!link || (link.rel === 'stylesheet' && link.sheet)) return Promise.resolve()
  return new Promise((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true })
    link.addEventListener('error', () => resolve(), { once: true })
    setTimeout(resolve, 3000)
  })
}

// …and only after the browser has drawn a frame, so the first-paint headline is always on screen before the app
// replaces it (on a fast load the app used to start before anything was drawn).
const afterFirstPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

mainCssReady().then(afterFirstPaint).then(() => ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
))
