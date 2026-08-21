import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles/base.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/*
 * Offline, so the app is a thing you can take with you.
 *
 * Registered only in a production build — a worker caching a dev server is a
 * reliable way to spend an afternoon debugging a stale bundle. The path is
 * relative because the app is served from a repository subpath on Pages, and
 * an absolute '/sw.js' would ask for a scope it does not own.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {
      // No offline support this launch. The app is otherwise unaffected.
    })
  })
}
