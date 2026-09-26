/* ============================================================
   PixelAbs Tools — edge worker
   ------------------------------------------------------------
   1. Serves the static site (via the ASSETS binding).
   2. Maps "/" to /index.html (needed because html_handling is
      "none", which disables Cloudflare's automatic root mapping
      but keeps every .html URL redirect-free).
   3. Accepts ANONYMOUS error reports at POST /__log.
   4. Same-origin API functions under /api/* — the site's Cloud
      mode calls these instead of the Render server directly, so
      the backend URL never ships in client code and the browser
      makes a plain same-origin request (no CORS at all).
        POST /api/compress           -> PDF compression (Ghostscript)
        POST /api/image/compress     -> image compression
        POST /api/image/convert      -> image conversion (HEIC etc.)
        POST /api/image/resize       -> image resizing
        POST /api/pdf/merge          -> merge PDFs
        POST /api/pdf/split          -> split PDF
        POST /api/pdf/from-images    -> images to PDF
        POST /api/audio/trim         -> trim audio (MP3, ffmpeg)
        POST /api/audio/speed        -> change speed/pitch (MP3, ffmpeg)
        POST /api/audio/join         -> join audio files (MP3, ffmpeg)
        POST /api/video/gif          -> video to GIF (ffmpeg)
        GET  /api/health             -> backend health check
        GET  /api                    -> tiny service info


   Privacy contract: uploaded files STREAM through this worker to
   the processing server and are never stored, buffered to disk,
   or logged. Error reports (see /__log) are the ONLY data the
   site ever sends home:
     - error message text (truncated to 200 chars)
     - page path (e.g. /tools/qr-code.html)
     - timestamp
   No user identifiers, no IPs stored by the app, no cookies,
   no file names or file content — ever.

   Reports are logged with console.log and show up in the
   Cloudflare dashboard under Observability -> Logs.
   ============================================================ */

const MAX_EVENTS_PER_POST = 25;

/* Backend processing server (Render, free tier). Override with the
   RENDER_URL environment variable (Workers dashboard or wrangler). */
const RENDER_DEFAULT = "https://pixelabs-api-e0u3.onrender.com";

/* Only these backend endpoints may be proxied — keeps the worker
   from being usable as a general-purpose proxy. */
const BACKEND_PATHS = [
  "/compress",
  "/image/compress",
  "/image/convert",
  "/image/resize",
  "/pdf/merge",
  "/pdf/split",
  "/pdf/from-images",
  "/audio/trim",
  "/audio/speed",
  "/audio/join",
  "/video/gif",
  "/health"
];

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

/* Proxy one request to the backend, streaming the body through. */
async function proxyToBackend(request, env, backendPath, url) {
  /* Size guard: the backend accepts up to 50 MB. */
  const len = parseInt(request.headers.get("content-length") || "0", 10);
  if (len > 60000000) {
    return json({ ok: false, error: "file too large (50 MB limit)" }, 413);
  }

  /* Same-origin guard: browsers always send an Origin header on
     cross-site XHR, so a mismatched origin is rejected. */
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== url.host) {
        return json({ ok: false, error: "cross-origin requests are not allowed" }, 403);
      }
    } catch (err) {
      /* malformed origin — let the request through */
    }
  }

  let backend = (env && env.RENDER_URL) || RENDER_DEFAULT;
  while (backend.length && backend.slice(-1) === "/") backend = backend.slice(0, -1);
  const target = backend + backendPath + (url.search || "");

  const headers = new Headers();
  for (const pair of request.headers) {
    const k = pair[0].toLowerCase();
    if (k === "host" || k === "origin" || k === "referer" ||
        k === "content-length" || k === "accept-encoding") continue;
    headers.set(pair[0], pair[1]);
  }

  const init = { method: request.method, headers: headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  try {
    return await fetch(target, init);
  } catch (err) {
    return json({ ok: false, error: "backend unreachable" }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* Serve the homepage at "/" without any redirect.
       html_handling is "none", so the root is not auto-mapped.
       NOTE: pass a plain URL string — constructing a Request from a
       navigation request (mode "navigate") throws a TypeError. */
    if (request.method === "GET" && url.pathname === "/") {
      if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(new URL("/index.html", url).toString());
      }
    }

    /* ---------- /api — same-origin processing functions ---------- */
    if (url.pathname === "/api" || url.pathname === "/api/") {
      return json({
        ok: true,
        service: "pixelabs-tools-edge",
        functions: [
          "/api/health",
          "/api/compress",
          "/api/image/compress",
          "/api/image/convert",
          "/api/image/resize",
          "/api/pdf/merge",
          "/api/pdf/split",
          "/api/pdf/from-images",
          "/api/audio/trim",
          "/api/audio/speed",
          "/api/audio/join",
          "/api/video/gif"
        ]
      });
    }


    if (url.pathname.length > 5 && url.pathname.slice(0, 5) === "/api/") {
      const backendPath = url.pathname.slice(4);
      if (BACKEND_PATHS.indexOf(backendPath) === -1) {
        return json({ ok: false, error: "unknown api path" }, 404);
      }
      return proxyToBackend(request, env, backendPath, url);
    }

    /* ---------- /__log — anonymous error reports ---------- */
    if (request.method === "POST" && url.pathname === "/__log") {
      try {
        const body = await request.text();
        let events = JSON.parse(body || "[]");
        if (!Array.isArray(events)) events = [events];

        for (let i = 0; i < events.length && i < MAX_EVENTS_PER_POST; i++) {
          const e = events[i] || {};
          console.log(
            JSON.stringify({
              type: "user-error",
              m: String(e.m || "").slice(0, 200),
              u: String(e.u || "").slice(0, 120),
              t: e.t || Date.now()
            })
          );
        }
      } catch (err) {
        console.log(
          JSON.stringify({ type: "user-error", m: "bad-payload", u: url.pathname })
        );
      }
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }


    /* Guard: if the ASSETS binding is somehow missing, fail clearly
       instead of throwing a TypeError (which becomes a 504). */
    if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response(
        "Assets binding unavailable - redeploy the Worker (see wrangler.jsonc: assets.binding = ASSETS)",
        { status: 503, headers: { "Content-Type": "text/plain" } }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
