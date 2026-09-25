/* ============================================================
   PixelAbs Tools — edge worker
   ------------------------------------------------------------
   1. Serves the static site (via the ASSETS binding).
   2. Maps "/" to /index.html (needed because html_handling is
      "none", which disables Cloudflare's automatic root mapping
      but keeps every .html URL redirect-free).
   3. Accepts ANONYMOUS error reports at POST /__log.

   Privacy contract for error reports (this is the ONLY data the
   site ever sends home):
     - error message text (truncated to 200 chars)
     - page path (e.g. /tools/qr-code.html)
     - timestamp
   No user identifiers, no IPs stored by the app, no cookies,
   no file names or file content — ever.

   Reports are logged with console.log and show up in the
   Cloudflare dashboard under Observability -> Logs.
   ============================================================ */

const MAX_EVENTS_PER_POST = 25;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* Serve the homepage at "/" without any redirect.
       html_handling is "none", so the root is not auto-mapped. */
    if (request.method === "GET" && url.pathname === "/") {
      if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
      }
    }

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
