import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import Konva from 'konva'
import App from './App'
import { loadFonts } from './lib/fonts'
import './index.css'

// Retina sharp without overworking mid-range phones.
Konva.pixelRatio = Math.min(2, window.devicePixelRatio || 1)

const root = createRoot(document.getElementById('root')!)
// Wait for the template fonts so the first canvas paint measures text correctly.
loadFonts().finally(() =>
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  ),
)
