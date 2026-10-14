import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles/global.css'
import { captureAttribution } from './services/attribution.js'

// Where this visitor came from (ad, search, direct…), for the sales report.
// Staff pages are not visits.
if (!/^\/(warehouse|admin)/.test(window.location.pathname)) captureAttribution()

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
