/*
 * Offline, because the point of it being on a phone is that it works on a
 * train.
 *
 * Cache-first for the shell, which is correct here for a reason particular to
 * this app: everything it knows is computed on the device from two JSON case
 * files, and progress lives in localStorage. There is no server state to be
 * stale about. A new build lands on the next launch after the one that fetched
 * it, which for a trainer opened daily is soon enough, and never mid-session.
 *
 * PRECACHE is rewritten at build time by scripts/build-sw.ts with the real
 * hashed asset names. In dev this file is never registered at all.
 */

const VERSION = 'dev'
const PRECACHE = ['./', './index.html']
const SHELL = `lookahead-shell-${VERSION}`
const RUNTIME = 'lookahead-runtime'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Individually, so one 404 cannot poison the whole install.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  // A navigation must always resolve to the shell: deep links, a cold launch
  // from the home screen, and the hash routes all land on index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches
        .match('./index.html')
        .then((hit) => hit || fetch(request))
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  // Fonts and anything else off-origin: serve what we have, refresh in the
  // background, and never let a dead network block the interface.
  if (!sameOrigin) {
    event.respondWith(
      caches.open(RUNTIME).then((cache) =>
        cache.match(request).then((hit) => {
          const live = fetch(request)
            .then((response) => {
              if (response.ok || response.type === 'opaque') cache.put(request, response.clone())
              return response
            })
            .catch(() => hit)
          return hit || live
        }),
      ),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(SHELL).then((cache) => cache.put(request, copy))
            }
            return response
          })
          .catch(() => hit),
    ),
  )
})
