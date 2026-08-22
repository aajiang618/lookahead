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

  /*
   * Pick up a new build without waiting for a second launch.
   *
   * The worker already calls skipWaiting and claim, so a new version takes over
   * as soon as it installs — but THIS page was served from the old cache before
   * that happened, so it keeps running the old bundle until something reloads
   * it. That is why a deploy has always taken two launches to appear, and why
   * "I pushed it" and "I cannot see it" were both true at once.
   *
   * `controllerchange` fires exactly when the new worker takes over. A null
   * controller means this page was never controlled — a first install, not an
   * update — and reloading for that would be a reload for nothing.
   */
  if (navigator.serviceWorker.controller) {
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true

      /*
       * Never mid-rep. Reloading while a case is on screen would throw away an
       * answer the solver is in the middle of giving, to show them a cosmetic
       * change — so if a drill is presenting, wait until the app is put away
       * and swap the build then.
       */
      const midRep = () => Boolean(document.querySelector('.stage[data-phase="presenting"]'))
      if (!midRep()) {
        window.location.reload()
        return
      }
      document.addEventListener('visibilitychange', function whenHidden() {
        if (document.visibilityState !== 'hidden') return
        document.removeEventListener('visibilitychange', whenHidden)
        window.location.reload()
      })
    })
  }
}
