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
        POST /api/url/create         -> URL shortener (see below)
        GET  /api/health             -> backend health check
        GET  /api                    -> tiny service info

   5. URL shortener:
        GET  /s/CODE                 -> 302 redirect to the stored URL
        POST /api/url/create         -> {url} -> {code}
      The mapping lives in our Supabase database. Only the long URL,
      a short code, a creation timestamp and a click counter are
      stored — no creator identity, no IP, no cookies.

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
  "/health"
];

/* ---------- URL shortener (Supabase) ----------
   The anon key below is PUBLIC BY DESIGN (Supabase publishable key):
   the table itself is RLS-locked and only two SECURITY DEFINER
   functions are callable — get_url(code) and create_short_url(url).
   No secret credentials ship in this file.
   Dedicated project: "pixelabs-shortener" (ap-south-1, Mumbai). */
const SUPABASE_URL = "https://cttxkvehmvjlrpovkuox.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0dHhrdmVobXZqbHJwb3ZrdW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjY5ODAsImV4cCI6MjEwNjAwMjk4MH0.lV1JARLmQd7-uASH_04GCRodW9S85XE5DbGCFFKEETU";
const URL_CREATE_LIMIT_PER_HOUR = 20;
let shortCreates = {}; /* best-effort per-isolate rate limiting */

function isAlnum(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ok = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    if (!ok) return false;
  }
  return true;
}

function supabaseRpc(fn, arg) {
  return fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "authorization": "Bearer " + SUPABASE_ANON_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify(arg)
  });
}

function shortNotFound() {
  return new Response(
    "<!DOCTYPE html><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    "<body style='font-family:system-ui,sans-serif;text-align:center;padding:64px 24px;background:#0a0d15;color:#e8ebf4'>" +
    "<h2 style='margin:0 0 8px'>Short link not found</h2>" +
    "<p style='color:#98a1b5;margin:0 0 24px'>This short link does not exist (or was mistyped).</p>" +
    "<a href='/' style='display:inline-block;background:linear-gradient(90deg,#6366f1,#8b5cf6);color:#fff;" +
    "padding:12px 22px;border-radius:11px;text-decoration:none;font-weight:600'>PixelAbs Tools</a></body>",
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

/* GET /s/CODE -> 302 redirect */
async function handleShortLink(url) {
  const code = url.pathname.slice(3); /* strip "/s/" */
  if (code.length < 4 || code.length > 16 || !isAlnum(code)) {
    return shortNotFound();
  }
  try {
    const res = await supabaseRpc("get_url", { p_code: code });
    if (res.ok) {
      const txt = await res.text();
      let target = null;
      try { target = JSON.parse(txt); } catch (err) { target = null; }
      if (typeof target === "string" && target.length > 8 &&
          (target.slice(0, 7) === "http://" || target.slice(0, 8) === "https://")) {
        return new Response(null, {
          status: 302,
          headers: { "Location": target, "Cache-Control": "no-store" }
        });
      }
    }
  } catch (err) { /* fall through to 404 */ }
  return shortNotFound();
}

/* POST /api/url/create {url} -> {ok, code, short} */
async function handleCreateShortUrl(request, url) {
  /* same-origin guard, same policy as the backend proxy */
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== url.host) {
        return json({ ok: false, error: "cross-origin requests are not allowed" }, 403);
      }
    } catch (err) { /* malformed origin — let it through */ }
  }

  let longUrl = "";
  try {
    const body = await request.json();
    longUrl = String((body && body.url) || "").trim();
  } catch (err) {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  if (longUrl.length < 8 || longUrl.length > 2048 ||
      (longUrl.slice(0, 7) !== "http://" && longUrl.slice(0, 8) !== "https://")) {
    return json({ ok: false, error: "enter a valid http:// or https:// URL (max 2048 characters)" }, 400);
  }

  /* best-effort rate limit (per isolate, per IP) */
  const ip = request.headers.get("cf-connecting-ip") || "anon";
  const now = Date.now();
  const hits = (shortCreates[ip] || []).filter(t => now - t < 3600000);
  if (hits.length >= URL_CREATE_LIMIT_PER_HOUR) {
    return json({ ok: false, error: "too many links created from this network this hour — try again later" }, 429);
  }
  hits.push(now);
  if (Object.keys(shortCreates).length > 5000) shortCreates = {};
  shortCreates[ip] = hits;

  try {
    const res = await supabaseRpc("create_short_url", { p_url: longUrl });
    const txt = await res.text();
    if (res.ok) {
      let code = null;
      try { code = JSON.parse(txt); } catch (err) { code = null; }
      if (typeof code === "string" && code.length >= 4 && isAlnum(code)) {
        return json({ ok: true, code: code, short: url.origin + "/s/" + code });
      }
      return json({ ok: false, error: "unexpected response from the database" }, 502);
    }
    /* PostgREST error details are English-only technical text; map the
       two known validation failures, keep others generic. */
    if (txt.indexOf("only http and https") > -1) {
      return json({ ok: false, error: "only http and https URLs are supported" }, 400);
    }
    return json({ ok: false, error: "could not create the short link, please try again" }, 500);
  } catch (err) {
    return json({ ok: false, error: "database unreachable, please try again" }, 502);
  }
}

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
          "/api/url/create"
        ]
      });
    }

    /* ---------- URL shortener: create ---------- */
    if (request.method === "POST" && url.pathname === "/api/url/create") {
      return handleCreateShortUrl(request, url);
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

    /* ---------- URL shortener: redirect ---------- */
    if (request.method === "GET" && url.pathname.indexOf("/s/") === 0) {
      return handleShortLink(url);
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
