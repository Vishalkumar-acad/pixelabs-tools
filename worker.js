/* ============================================================
   PixelAbs Tools — edge worker
   ------------------------------------------------------------
   1. Serves the static site (via the ASSETS binding).
   2. Maps "/" to /index.html (needed because html_handling is
      "none", which disables Cloudflare's automatic root mapping
      but keeps every .html URL redirect-free).
   3. Accepts ANONYMOUS error reports at POST /__log.
   4. Same-origin API functions under /api/* — the site's Cloud
      mode calls these instead of the backend server directly, so
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
        GET  /api/uptime             -> cloud status (UptimeRobot
                                        public status page data)
   5. Markdown for Agents (content negotiation): requests that
      send "Accept: text/markdown" get a clean Markdown rendering
      of the page. Browsers never send this header, so visitors
      always get the normal HTML.
   6. Declares the site Content-Signal policy (search and AI
      input allowed, NO AI training) in robots.txt and as a
      "Content-Signal" response header on HTML pages.


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

/* Backend processing server — self-hosted on an Azure VM and fronted
   by Cloudflare (api.pixelabs.in). Override with the RENDER_URL
   environment variable (Workers dashboard or wrangler). */
const RENDER_DEFAULT = "https://api.pixelabs.in";

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
  "/pdf/to-images",
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
  /* Size guard: a backstop only. The backend is the authority on limits
     (50 MB for images/audio, 90 MB for PDF compression), and this just
     stops an absurd upload from ever reaching it. */
  const len = parseInt(request.headers.get("content-length") || "0", 10);
  if (len > 100000000) {
    return json({ ok: false, error: "file too large" }, 413);
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

/* ============================================================
   Markdown for Agents — content negotiation
   ------------------------------------------------------------
   When a client asks for "Accept: text/markdown", the worker
   converts the requested HTML page into clean Markdown on the
   fly (self-contained tokenizer + converter, no dependencies).
   Browsers never send this header, so they always get the
   normal HTML — nothing changes for visitors. Non-content
   elements (site header, footer, nav, scripts, forms) are
   stripped; headings, links, lists and emphasis are preserved;
   YAML frontmatter carries the page title and description.
   ============================================================ */

/* The site's content policy — also declared in robots.txt. */
const CONTENT_SIGNAL = "ai-train=no, search=yes, ai-input=yes";

/* Short public page addresses -> real pages (301 redirects). */
const PAGE_ALIASES = {
  "/about": "/about.html",
  "/status": "/status.html"
};

/* UptimeRobot PUBLIC status page id (the /status page proxies its
   JSON — it is public dashboard data, no API key involved). */
const STATUS_PAGE_JSON = "https://status.pixelabs.in/index.json";
const STATUS_PAGE_URL = "https://status.pixelabs.in/";

/* Tags whose entire subtree is dropped from the markdown. */
const MD_SKIP = {
  script: 1, style: 1, noscript: 1, svg: 1, iframe: 1, form: 1,
  button: 1, select: 1, textarea: 1, nav: 1, header: 1, footer: 1,
  template: 1, aside: 1, head: 1
};

/* Void (self-closing) HTML elements. */
const MD_VOID = {
  br: 1, img: 1, hr: 1, meta: 1, link: 1, input: 1, source: 1,
  area: 1, base: 1, col: 1, embed: 1, track: 1, wbr: 1
};

const MD_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " "
};

function mdDecodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) {
      return String.fromCodePoint(parseInt(h, 16));
    })
    .replace(/&#(\d+);/g, function (m, d) {
      return String.fromCodePoint(parseInt(d, 10));
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, function (m, name) {
      return MD_ENTITIES[name];
    });
}

/* Parse the attribute section inside a start tag. */
function mdAttrs(inner) {
  const attrs = {};
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(inner))) {
    attrs[m[1].toLowerCase()] = m[2] !== undefined ? m[2]
      : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ""));
  }
  return attrs;
}

/* Minimal HTML tokenizer: start tags, end tags, text chunks.
   Comments and doctype are dropped; a "<" that is not really a
   tag stays as text. */
function mdTokenize(html) {
  const toks = [];
  const n = html.length;
  let i = 0;
  let text = "";
  function flush() {
    if (text) { toks.push({ t: "text", v: text }); text = ""; }
  }
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) { text += html.slice(i); break; }
    if (lt > i) text += html.slice(i, lt);
    i = lt;

    if (html.startsWith("<!--", i)) {
      flush();
      const end = html.indexOf("-->", i);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (html.charAt(i + 1) === "!" || html.charAt(i + 1) === "?") {
      flush();
      const end = html.indexOf(">", i);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (html.charAt(i + 1) === "/") {
      const end = html.indexOf(">", i);
      if (end === -1) { i = n; break; }
      const name = html.slice(i + 2, end).trim().toLowerCase();
      if (name) { flush(); toks.push({ t: "end", tag: name.split(/[\s\/]/)[0] }); }
      i = end + 1;
      continue;
    }

    const end = html.indexOf(">", i);
    if (end === -1) { i = n; break; }
    let inner = html.slice(i + 1, end);
    let selfClose = false;
    if (inner.slice(-1) === "/") { selfClose = true; inner = inner.slice(0, -1); }
    const m = inner.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
    if (!m) {
      text += html.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    flush();
    const tag = m[0].toLowerCase();
    toks.push({
      t: "start",
      tag: tag,
      attrs: mdAttrs(inner.slice(m[0].length)),
      self: selfClose || MD_VOID[tag] === 1
    });
    i = end + 1;
  }
  flush();
  return toks;
}

/* Convert one HTML document to Markdown. */
function htmlToMarkdown(html, base) {
  /* ---- metadata (title / description / og:image) ---- */
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  let metaDesc = "", ogTitle = "", ogDesc = "", ogImage = "";
  const metaRe = /<meta\b[^>]*>/gi;
  let mm;
  while ((mm = metaRe.exec(html))) {
    const a = mdAttrs(mm[0].slice(5, -1));
    const name = String(a.name || a.property || "").toLowerCase();
    const content = String(a.content || "");
    if (name === "description" && !metaDesc) metaDesc = content;
    else if (name === "og:title" && !ogTitle) ogTitle = content;
    else if (name === "og:description" && !ogDesc) ogDesc = content;
    else if (name === "og:image" && !ogImage) ogImage = content;
  }

  const toks = mdTokenize(html);
  const out = [];
  const stack = [];
  let skipDepth = 0;
  let preDepth = 0;

  function clean(s) { return s.replace(/\s+/g, " ").trim(); }
  function abs(u) {
    u = mdDecodeEntities(String(u || ""));
    if (!u || u.charAt(0) === "#") return u;
    try { return new URL(u, base).toString(); } catch (err) { return u; }
  }
  function push(s) {
    if (stack.length) stack[stack.length - 1].buf += s;
    else out.push(s);
  }

  function emit(f) {
    if (f.tag === "pre") preDepth--;
    let s = "";
    switch (f.tag) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
        const lvl = f.tag.charCodeAt(1) - 48;
        const t = clean(f.buf);
        s = t ? "\n\n" + new Array(lvl + 1).join("#") + " " + t + "\n\n" : "";
        break;
      }
      case "p": {
        const t = clean(f.buf);
        s = t ? "\n\n" + t + "\n\n" : "";
        break;
      }
      case "strong": case "b": {
        const t = clean(f.buf);
        s = t ? "**" + t + "**" : "";
        break;
      }
      case "em": case "i": {
        const t = clean(f.buf);
        s = t ? "*" + t + "*" : "";
        break;
      }
      case "a": {
        const href = abs(f.attrs.href);
        if (!href) { s = clean(f.buf); break; }
        if (f.buf.indexOf("\n\n") !== -1) {
          /* link that wraps block content (e.g. homepage tool
             cards): the leading inline text becomes the link,
             the block children follow as normal markdown */
          const parts = f.buf.split("\n\n");
          const label = clean(parts.shift());
          s = (label ? "[" + label + "](" + href + ")\n\n" : "") + parts.join("\n\n");
        } else {
          const t = clean(f.buf);
          s = t ? "[" + t + "](" + href + ")" : "";
        }
        break;
      }
      case "code": {
        if (preDepth > 0) {
          s = f.buf; /* inside <pre> — raw text, no backticks */
        } else {
          const t = clean(f.buf);
          s = t ? "`" + t + "`" : "";
        }
        break;
      }
      case "pre": {
        const t = f.buf.replace(/\s+$/, "");
        s = t ? "\n\n```\n" + t + "\n```\n\n" : "";
        break;
      }
      case "li": {
        let marker = "- ";
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k].tag === "ol" || stack[k].tag === "ul") {
            if (stack[k].tag === "ol") {
              stack[k].idx = (stack[k].idx || 0) + 1;
              marker = stack[k].idx + ". ";
            }
            break;
          }
        }
        const t = f.buf.replace(/^\s+|\s+$/g, "");
        s = t ? "\n" + marker + t.replace(/\n/g, "\n  ") + "\n" : "";
        break;
      }
      case "ul": case "ol": s = "\n\n"; break;
      case "blockquote": {
        const t = clean(f.buf);
        s = t ? "\n\n" + t.split("\n").map(function (l) { return "> " + l; }).join("\n") + "\n\n" : "";
        break;
      }
      default: s = f.buf; /* div, span, section, main … pass through */
    }
    if (s) push(s);
  }

  for (let x = 0; x < toks.length; x++) {
    const tok = toks[x];
    if (skipDepth > 0) {
      if (tok.t === "start" && MD_SKIP[tok.tag]) skipDepth++;
      else if (tok.t === "end" && MD_SKIP[tok.tag]) skipDepth--;
      continue;
    }
    if (tok.t === "text") { push(mdDecodeEntities(tok.v)); continue; }
    if (tok.t === "start") {
      if (MD_SKIP[tok.tag]) { skipDepth = 1; continue; }
      if (tok.tag === "br") { push("\n"); continue; }
      if (tok.tag === "hr") { push("\n\n---\n\n"); continue; }
      if (tok.tag === "img") {
        const src = abs(tok.attrs.src);
        if (src) {
          push("![" + String(tok.attrs.alt || "").replace(/[\[\]]/g, "") + "](" + src + ")");
        }
        continue;
      }
      const frame = { tag: tok.tag, buf: "", attrs: tok.attrs, idx: 0 };
      stack.push(frame);
      if (tok.tag === "pre") preDepth++;
      if (tok.self) emit(stack.pop());
      continue;
    }
    /* end tag: find the matching open frame, closing anything
       left unclosed above it (HTML is forgiving, we are too) */
    let idx = -1;
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].tag === tok.tag) { idx = k; break; }
    }
    if (idx === -1) continue; /* stray end tag */
    while (stack.length > idx) emit(stack.pop());
  }
  while (stack.length) emit(stack.pop());

  let body = out.join("").replace(/[ \t]+\n/g, "\n");

  /* strip leading whitespace per line (source indentation), but
     never inside fenced code blocks */
  const bodyLines = body.split("\n");
  let inFence = false;
  for (let li = 0; li < bodyLines.length; li++) {
    if (bodyLines[li].slice(0, 3) === "```") { inFence = !inFence; continue; }
    if (!inFence) bodyLines[li] = bodyLines[li].replace(/^[ \t]+/, "");
  }
  body = bodyLines.join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+/, "");

  const fmTitle = clean(mdDecodeEntities(title || ogTitle));
  const fmDesc = clean(mdDecodeEntities(metaDesc || ogDesc));
  const fmImage = abs(ogImage);
  const lines = [];
  if (fmTitle) lines.push("title: " + fmTitle);
  if (fmDesc) lines.push("description: " + fmDesc);
  if (fmImage) lines.push("image: " + fmImage);

  return (lines.length ? "---\n" + lines.join("\n") + "\n---\n\n" : "") + body + "\n";
}

/* Serve a page as markdown, or return null to fall through to
   normal HTML serving. */
async function serveMarkdown(env, url) {
  let path = url.pathname;
  if (path === "/") path = "/index.html";
  else if (path.slice(-1) === "/") path = path.slice(0, -1);
  if (PAGE_ALIASES[path]) path = PAGE_ALIASES[path];
  if (path.slice(-5) !== ".html") return null;

  let res;
  try {
    res = await env.ASSETS.fetch(new URL(path, url).toString());
  } catch (err) {
    return null;
  }
  if (!res || !res.ok) return null;

  const html = await res.text();
  const markdown = htmlToMarkdown(html, url.toString());
  const headers = new Headers();
  headers.set("Content-Type", "text/markdown; charset=utf-8");
  headers.set("Vary", "Accept");
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("Content-Signal", CONTENT_SIGNAL);
  headers.set("X-Markdown-Tokens", String(Math.ceil(markdown.length / 4)));
  headers.set("X-Original-Tokens", String(Math.ceil(html.length / 4)));
  return new Response(markdown, { status: 200, headers: headers });
}

/* Attach the Content-Signal policy header to HTML responses. */
function withContentSignal(res) {
  try {
    if (res && res.ok &&
        (res.headers.get("content-type") || "").indexOf("text/html") !== -1 &&
        !res.headers.has("content-signal")) {
      const wrapped = new Response(res.body, res);
      wrapped.headers.set("Content-Signal", CONTENT_SIGNAL);
      return wrapped;
    }
  } catch (err) {
    /* fall through to the original response */
  }
  return res;
}

/* Reshape a Better Stack status page (JSON:API) into a compact object:
   { state, updated, announcement, sections:[{name, services:[...]}] }.
   Each service carries its current status, uptime % and daily history. */
function normaliseStatusPage(j) {
  const attrs = (j && j.data && j.data.attributes) || {};
  const inc = (j && j.included) || [];

  const sections = inc
    .filter((x) => x.type === "status_page_section")
    .map((x) => ({
      id: String(x.id),
      name: (x.attributes && x.attributes.name) || "Services",
      position: (x.attributes && x.attributes.position) || 0
    }))
    .sort((a, b) => a.position - b.position);

  const resources = inc
    .filter((x) => x.type === "status_page_resource")
    .map((x) => {
      const a = x.attributes || {};
      return {
        sectionId: String(a.status_page_section_id),
        name: a.public_name || "Service",
        note: a.explanation || "",
        status: a.status || "not_monitored",
        availability: typeof a.availability === "number"
          ? Math.round(a.availability * 100000) / 1000
          : null,
        position: a.position || 0,
        history: (a.status_history || []).map((h) => ({ day: h.day, status: h.status }))
      };
    })
    .sort((a, b) => a.position - b.position);

  const groups = sections
    .map((s) => ({ name: s.name, services: resources.filter((r) => r.sectionId === s.id) }))
    .filter((g) => g.services.length);

  const known = new Set(sections.map((s) => s.id));
  const orphans = resources.filter((r) => !known.has(r.sectionId));
  if (orphans.length) groups.push({ name: "Other services", services: orphans });

  return {
    provider: "Better Stack",
    page: STATUS_PAGE_URL,
    company: attrs.company_name || "Service Status",
    state: attrs.aggregate_state || "unknown",
    updated: attrs.updated_at || null,
    announcement: attrs.announcement || null,
    sections: groups
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ---------- Markdown for Agents (Accept: text/markdown) ----------
       Browsers ask for HTML and always get HTML. Agents that ask
       for markdown get a clean markdown rendering of the page. */
    if (
      request.method === "GET" && env && env.ASSETS &&
      typeof env.ASSETS.fetch === "function" &&
      (request.headers.get("accept") || "").indexOf("text/markdown") !== -1
    ) {
      const mdRes = await serveMarkdown(env, url);
      if (mdRes) return mdRes;
    }

    /* Serve the homepage at "/" without any redirect.
       html_handling is "none", so the root is not auto-mapped.
       NOTE: pass a plain URL string — constructing a Request from a
       navigation request (mode "navigate") throws a TypeError. */
    if (request.method === "GET" && url.pathname === "/") {
      if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return withContentSignal(
          await env.ASSETS.fetch(new URL("/index.html", url).toString())
        );
      }
    }

    /* ---------- /about, /status — server-side redirects ----------
       The request reaches this worker (the server) FIRST, and the
       server sends the visitor to the real page URL. Clean short
       address, one canonical page, nothing changes on the page
       itself. 301 = permanent, so browsers cache the jump. */
    const aliasPath = PAGE_ALIASES[url.pathname.slice(-1) === "/"
      ? url.pathname.slice(0, -1)
      : url.pathname];
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      aliasPath
    ) {
      const aliasTarget = new URL(aliasPath, url);
      aliasTarget.search = url.search; /* keep query params, if any */
      return Response.redirect(aliasTarget.toString(), 301);
    }

    /* ---------- /api/uptime — cloud status page data ----------
       Proxies the PUBLIC Better Stack status page JSON
       (status.pixelabs.in/index.json — no API key, public data) so the
       browser makes a plain same-origin request, and reshapes it into a
       compact form the status page renders. Short cache: the upstream
       page refreshes every 60 s. */
    if (request.method === "GET" &&
        (url.pathname === "/api/uptime" || url.pathname === "/api/uptime/")) {
      try {
        const upRes = await fetch(STATUS_PAGE_JSON, {
          headers: { "Accept": "application/json" },
          cf: { cacheTtl: 30, cacheEverything: true }
        });
        if (!upRes.ok) {
          return json({ ok: false, error: "status page returned " + upRes.status }, 502);
        }
        const j = await upRes.json();
        return new Response(JSON.stringify(normaliseStatusPage(j)), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=30, stale-while-revalidate=60"
          }
        });
      } catch (err) {
        return json({ ok: false, error: "status feed unreachable" }, 502);
      }
    }

    /* ---------- /api — same-origin processing functions ---------- */
    if (url.pathname === "/api" || url.pathname === "/api/") {
      return json({
        ok: true,
        service: "pixelabs-tools-edge",
        functions: [
          "/api/health",
          "/api/uptime",
          "/api/compress",
          "/api/image/compress",
          "/api/image/convert",
          "/api/image/resize",
          "/api/pdf/merge",
          "/api/pdf/split",
          "/api/pdf/from-images",
          "/api/pdf/to-images",
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

    return withContentSignal(await env.ASSETS.fetch(request));
  }
};
