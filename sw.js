/* PixelAbs Tools — service worker
   Cache-first for same-origin assets so every tool works fully offline
   after the first visit.

   Design guarantees:
   1. All paths are resolved RELATIVE to the service worker's scope, so the
      site works at any host or sub-path (root domain, /repo/, etc.).
   2. A navigation request can NEVER hard-fail. Fallback chain:
      cache → network → cached homepage → friendly offline page.
   3. A redirected response is NEVER served to a navigation (Chrome
      rejects those with ERR_FAILED). Redirected responses are re-fetched
      at their final URL to produce a clean response instead.
   4. Cached pages are refreshed in the background (stale-while-revalidate),
      so updates arrive on the next visit. Bump CACHE_VERSION to force an
      immediate refresh.

   ============================================================ */
"use strict";

var CACHE_VERSION = "pat-v18";

/* Scope-relative path helper — prefixes paths with the service worker's
   scope. (Avoids new URL(), which would discard the scope's sub-path for
   leading-slash paths, breaking /repo/-style hosting.) */
var ROOT = (function () {
  var scope = self.registration.scope;
  return scope.slice(-1) === "/" ? scope.slice(0, -1) : scope;
})();
function P(path) {
  return ROOT + path;
}

/* Precache manifest uses SCOPE-RELATIVE paths only (no absolute host paths). */
var PRECACHE_REL = [
  "/",
  "/index.html",
  "/terms.html",
  "/privacy.html",
  "/assets/css/style.css",
  "/assets/js/common.js",
  "/assets/js/cloud.js",
  "/assets/js/compress-worker.js",
  "/assets/js/tools/image-compressor.js",
  "/assets/js/tools/image-converter.js",
  "/assets/js/tools/image-resizer.js",
  "/assets/js/tools/pdf-merge.js",
  "/assets/js/tools/pdf-split.js",
  "/assets/js/tools/images-to-pdf.js",
  "/assets/js/tools/json-formatter.js",
  "/assets/js/tools/pdf-compressor.js",
  "/assets/js/tools/text-case.js",
  "/assets/js/tools/base64.js",
  "/assets/js/tools/qr-code.js",
  "/assets/vendor/pdf.min.js",
  "/assets/vendor/pdf.worker.min.js",
  "/assets/vendor/pdf-lib.min.js",
  "/assets/vendor/jszip.min.js",
  "/assets/vendor/qrcode.min.js",
  "/assets/fonts/InterVariable.woff2",
  "/assets/img/icon-192.png",
  "/assets/img/icon-512.png",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
  "/tools/image-compressor.html",
  "/tools/image-converter.html",
  "/tools/image-resizer.html",
  "/tools/pdf-merge.html",
  "/tools/pdf-split.html",
  "/tools/images-to-pdf.html",
  "/tools/json-formatter.html",
  "/tools/pdf-compressor.html",
  "/tools/text-case.html",
  "/tools/base64.html",
  "/tools/qr-code.html"
];

var PRECACHE = PRECACHE_REL.map(function (p) { return P(p); });

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) {
        /* Add files individually so one transient failure cannot
           break the whole install (addAll is all-or-nothing). */
        return Promise.all(PRECACHE.map(function (url) {
          return cache.add(url).catch(function () { /* skip missing assets */ });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_VERSION) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Friendly last-resort page for failed navigations */
function offlinePage() {
  var home = P("/");
  return new Response(
    "<!DOCTYPE html><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    "<body style='font-family:system-ui,sans-serif;text-align:center;padding:48px 24px;background:#0a0d15;color:#e8ebf4'>" +
    "<h2 style='margin:0 0 8px'>You're offline</h2>" +
    "<p style='color:#98a1b5;margin:0 0 24px'>This page isn't cached yet, but the rest of the tools are.</p>" +
    "<a href='" + home + "' style='display:inline-block;background:linear-gradient(90deg,#6366f1,#8b5cf6);color:#fff;" +
    "padding:12px 22px;border-radius:11px;text-decoration:none;font-weight:600'>Go to homepage</a></body>",
    { status: 503, headers: { "Content-Type": "text/html" } }
  );
}

/* Cached homepage fallback for failed navigations */
function homepageFallback() {
  return caches.match(P("/"))
    .catch(function () { return null; })
    .then(function (cachedHome) {
      if (cachedHome && !cachedHome.redirected) return cachedHome;
      return caches.match(P("/index.html"))
        .catch(function () { return null; })
        .then(function (cachedIndex) {
          if (cachedIndex && !cachedIndex.redirected) return cachedIndex;
          return offlinePage();
        });
    });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== location.origin) return; /* never touch cross-origin */

  var isNavigation = request.mode === "navigate";

  function store(key, response) {
    if (response && response.ok && response.type === "basic" && !response.redirected) {
      var copy = response.clone();
      caches.open(CACHE_VERSION)
        .then(function (cache) { return cache.put(key, copy); })
        .catch(function () { /* cache write failure is non-fatal */ });
    }
    return response;
  }

  /* Chrome refuses to serve a redirected response to a navigation
     (ERR_FAILED). If we got one, re-fetch the FINAL url directly —
     that returns a clean, non-redirected response. */
  function unredirect(raw) {
    if (!raw || !raw.redirected) return Promise.resolve(raw);
    return fetch(raw.url).then(function (clean) {
      if (clean && clean.ok) {
        store(raw.url, clean.clone());
      }
      return clean;
    });
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then(function (cached) {
        if (cached && !cached.redirected) {
          /* Serve cache instantly; refresh in the background (cache-busting) */
          fetch(request)
            .then(unredirect)
            .then(function (fresh) { store(request.url, fresh); })
            .catch(function () { /* offline — cached copy is fine */ });
          return cached;
        }
        return fetch(request)
          .then(unredirect)
          .then(function (fresh) { return store(request.url, fresh); });
      })
      .catch(function (err) {
        /* Report the navigation failure anonymously (no user data —
           just the failed page path + error). Fire and forget. */
        try {
          fetch(P("/__log"), {
            method: "POST",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{ m: ("nav-fail: " + err).slice(0, 200), u: url.pathname, t: Date.now() }])
          }).catch(function () { /* network down — beacon dies, fine */ });
        } catch (e) { /* never block the fallback */ }

        /* Everything failed — for navigations fall back to the cached
           homepage, then the friendly offline page. No network errors. */
        if (isNavigation) return homepageFallback();
        return offlinePage();
      })
  );
});
