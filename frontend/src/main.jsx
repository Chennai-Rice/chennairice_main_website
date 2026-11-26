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

// It starts once the browser has actually painted the first-paint headline, and leaves it on screen 0.15 s more:
// replaced sooner, Chrome does not count it as the largest content and the LCP waits for the app (26 Nov 2026).
// Only the home page has that headline (index.html #boot); every other page starts at once. A browser that does not
// report paints goes on after 1.2 s at most.
const afterFirstPaint = () => new Promise((resolve) => {
  if (!document.documentElement.classList.contains('is-home')) return resolve()
  let done = false
  const go = () => { if (!done) { done = true; setTimeout(resolve, 150) } }
  try {
    const seen = performance.getEntriesByName('first-contentful-paint')[0]
    if (seen) return go()
    new PerformanceObserver((list, obs) => {
      if (list.getEntriesByName('first-contentful-paint').length) { obs.disconnect(); go() }
    }).observe({ type: 'paint', buffered: true })
  } catch { /* no paint timing */ }
  setTimeout(() => { if (!done) { done = true; resolve() } }, 1200)
})

mainCssReady().then(afterFirstPaint).then(() => ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
))
