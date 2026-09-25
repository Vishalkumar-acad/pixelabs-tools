/* PixelAbs Tools — service worker
   Cache-first for same-origin assets, so every tool works fully offline
   after the first visit. Bump CACHE_VERSION to force a refresh. */
"use strict";

var CACHE_VERSION = "pat-v1";

var PRECACHE = [
  "/",
  "/index.html",
  "/assets/css/style.css",
  "/assets/js/common.js",
  "/assets/js/compress-worker.js",
  "/assets/js/tools/image-compressor.js",
  "/assets/js/tools/image-converter.js",
  "/assets/js/tools/image-resizer.js",
  "/assets/js/tools/pdf-merge.js",
  "/assets/js/tools/pdf-split.js",
  "/assets/js/tools/images-to-pdf.js",
  "/assets/js/tools/json-formatter.js",
  "/assets/js/tools/text-case.js",
  "/assets/js/tools/base64.js",
  "/assets/js/tools/qr-code.js",
  "/assets/vendor/pdf-lib.min.js",
  "/assets/vendor/jszip.min.js",
  "/assets/vendor/qrcode.min.js",
  "/assets/img/icon-192.png",
  "/assets/img/icon-512.png",
  "/manifest.json",
  "/tools/image-compressor.html",
  "/tools/image-converter.html",
  "/tools/image-resizer.html",
  "/tools/pdf-merge.html",
  "/tools/pdf-split.html",
  "/tools/images-to-pdf.html",
  "/tools/json-formatter.html",
  "/tools/text-case.html",
  "/tools/base64.html",
  "/tools/qr-code.html"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(PRECACHE); })
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

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== location.origin) return; /* never touch cross-origin */

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) {
        /* Refresh in the background for next time */
        fetch(request).then(function (response) {
          if (response && response.ok) {
            caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, response); });
          }
        }).catch(function () { /* offline — cached copy is fine */ });
        return cached;
      }
      return fetch(request).then(function (response) {
        if (response && response.ok && response.type === "basic") {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
