/* ============================================================
   PixelAbs Tools â€” shared runtime (theme, dropzone, helpers)
   ============================================================ */
"use strict";

/* ---------- Theme ---------- */
(function initTheme() {
  const stored = localStorage.getItem("pat-theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (stored === "dark" || (!stored && prefersDark)) document.documentElement.classList.add("dark");
})();

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.classList.toggle("dark");
  localStorage.setItem("pat-theme", dark ? "dark" : "light");
}

/* ---------- Service worker (PWA / offline) ----------
   Registered with a RELATIVE path computed from the current page, so it
   works at any host or sub-path:
     "/"                     -> "./sw.js"
     "/tools/x.html"         -> "../sw.js"
     "/repo/tools/x.html"   -> "../../sw.js"  (e.g. GitHub Pages project sites)
---------------------------------------------------------------- */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", function () {
    var dir = location.pathname.replace(/\/[^/]*$/, "/");
    var depth = dir.split("/").filter(Boolean).length;
    var swUrl = (depth ? new Array(depth + 1).join("../") : "./") + "sw.js";
    navigator.serviceWorker.register(swUrl).catch(function () { /* offline mode optional */ });
  });

  /* When a NEW service worker version takes control of this page, reload
     once so the user gets the fresh assets immediately (cache-busting).
     Skipped on first-ever registration (no previous controller). */
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController) return;
    if (window.__patSwRefreshed) return;
    window.__patSwRefreshed = true;
    window.location.reload();
  });

  /* Back/forward cache (bfcache): when the page is restored from the
     navigation cache, refresh anything that may have gone stale. */
  window.addEventListener("pageshow", function (event) {
    if (event.persisted && typeof Savings !== "undefined" && Savings.render) {
      Savings.render();
    }
  });
}

/* ---------- Anonymous error reporting ----------
   The ONLY thing this site ever sends home: an error message,
   the page path, and a timestamp. No user identifiers, no
   cookies, no file content. Queued locally and flushed when
   online â€” so even failures on a dead network are captured. */
(function () {
  var KEY = "pat-errq";
  var MAX_QUEUE = 20;
  var captured = 0;

  function record(msg) {
    if (captured >= 5) return; /* max 5 errors per page view */
    captured++;
    try {
      var q = JSON.parse(localStorage.getItem(KEY) || "[]");
      q.push({ m: String(msg).slice(0, 200), u: location.pathname, t: Date.now() });
      if (q.length > MAX_QUEUE) q = q.slice(-MAX_QUEUE);
      localStorage.setItem(KEY, JSON.stringify(q));
    } catch (e) { /* private mode â€” drop silently */ }
  }

  window.addEventListener("error", function (ev) {
    record(ev.message || "unknown error");
  });
  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev && ev.reason;
    record((r && r.message) || "unhandled rejection");
  });

  function flush() {
    try {
      var q = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (!q.length) return;
      if (navigator.sendBeacon && navigator.sendBeacon("/__log", JSON.stringify(q))) {
        localStorage.setItem(KEY, "[]");
      }
    } catch (e) { /* never block the page */ }
  }

  window.addEventListener("load", function () { setTimeout(flush, 2500); });
  window.addEventListener("pagehide", flush);
  window.addEventListener("online", flush);
})();

/* ---------- Utilities ---------- */

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  if (!bytes && bytes !== 0) return "â€”";
  var units = ["B", "KB", "MB", "GB"];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i >= units.length) i = units.length - 1;
  var v = bytes / Math.pow(1024, i);
  return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)) + " " + units[i];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return "&#".concat(c.charCodeAt(0), ";");
  });
}

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeOXš™XÝT“
\›
NÈK
NÂŸB‚™[˜Ý[Ûˆ˜\ÙS˜[YJ˜[YJHÂˆ˜\ˆHH˜[YK›\Ý[™^ÙŠ‹ˆŠNÂˆ™]\›ˆHˆÈ˜[YKœÛXÙJJHˆ˜[YNÂŸB‚‹ÊˆKKKKKKKKKHØ\ÝKKKKKKKKKH
‹Â‚™[˜Ý[ÛˆØ\Ý
Y\ÜØYÙK\JHÂˆ˜\ˆ›ÛÝHØÝ[Y[™Ù][[Y[žRY
Ø\Ý\›ÛÝŠNÂˆYˆ
\›ÛÝ
HÂˆ›ÛÝHØÝ[Y[˜Ü™X]Q[[Y[
™]ˆŠNÂˆ›ÛÝšYHØ\Ý\›ÛÝŽÂˆØÝ[Y[˜›ÙK˜\[™Ú[
›ÛÝ
NÂˆBˆ˜\ˆ[HØÝ[Y[˜Ü™X]Q[[Y[
™]ˆŠNÂˆ[˜Û\ÜÓ˜[YHHØ\Ýˆ
È
\HˆŠNÂˆ[^ÛÛ[HY\ÜØYÙNÂˆ›ÛÝ˜\[™Ú[
[
NÂˆÙ][Y[Ý]
[˜Ý[Ûˆ

HÈ[œ™[[Ý™J
NÈKÌŒ
NÂŸB‚‹ÊˆKKKKKKKKKHØ]š[™ÜÈ˜XÚÙ\ˆ
ØØ[Û›JHKKKKKKKKKH
‹Â‚˜\ˆØ]š[™ÜÈHÂˆYˆ[˜Ý[Ûˆ
ž]\ÔØ]™Y
HÂˆžHÂˆ˜\ˆÝ\ˆH\œÙR[
ØØ[ÝÜ˜YÙK™Ù]][Jœ]\Ø]™YŠHŒ‹L
HÂˆÝ\ˆ
ÏHX]›X^
X]œ›Ý[™
ž]\ÔØ]™Y
JNÂˆØØ[ÝÜ˜YÙKœÙ]][Jœ]\Ø]™Y‹Ýš[™ÊÝ\ŠJNÂˆØ]š[™ÜËœ™[™\Š
NÂˆHØ]Ú
JHÈÊˆš]˜]H[ÙH
‹ÈBˆKˆÝ[ˆ[˜Ý[Ûˆ

HÂˆ™]\›ˆ\œÙR[
ØØ[ÝÜ˜YÙK™Ù]][Jœ]\Ø]™YŠHŒ‹L
HÂˆKˆ™[™\Žˆ[˜Ý[Ûˆ

HÂˆ˜\ˆ[HØÝ[Y[™Ù][[Y[žRY
œØ]š[™ÜË[›ÝHŠNÂˆYˆ
Y[
H™]\›ŽÂˆ˜\ˆÝ[HØ]š[™ÜËÝ[

NÂˆYˆ
Ý[ˆ
H[^ÛÛ[H–[ÝH]™HØ]™Yˆ
È›Ü›X]ž]\ÊÝ[
H
ÈˆÛÈ˜\ˆ\Ú[™È\ÙHÛÛËˆŽÂˆBŸNÂ‚™ØÝ[Y[˜Y]™[\Ý[™\Š‘ÓPÛÛ[ØYY‹Ø]š[™ÜËœ™[™\ŠNÂ‚‹ÊˆKKKKKKKKKH›Ü›Û™H˜XÝÜžHKKKKKKKKKKBˆXZÙQ›Ü›Û™JÂˆ[XØÙ\][\KÛ‘š[\ÂˆJB‹KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKH
‹Â‚™[˜Ý[ÛˆXZÙQ›Ü›Û™JÜÊHÂˆ˜\ˆ[HÜË™[Âˆ˜\ˆ[œ]H[œ]Y\žTÙ[XÝÜŠš[œ]Ý\OYš[WHŠNÂ‚ˆ[˜Ý[Ûˆ[™Qš[\Êš[S\Ý
HÂˆ˜\ˆš[\ÈH\œ˜^Kœ›ÝÝ\KœÛXÙK˜Ø[
š[S\Ý×JNÂˆYˆ
[ÜË›][\JHš[\ÈHš[\ËœÛXÙJJNÂˆYˆ
š[\Ë›[™Ý
HÜË›Û‘š[\Êš[\ÊNÂˆB‚ˆ[˜Y]™[\Ý[™\Š˜ÛXÚÈ‹[˜Ý[Ûˆ
JHÂˆYˆ
K\™Ù]OOH[œ]
H™]\›ŽÂˆ[œ]˜ÛXÚÊ
NÂˆJNÂˆ[œ]˜Y]™[\Ý[™\Š˜Ú[™ÙH‹[˜Ý[Ûˆ

HÂˆ[™Qš[\Ê[œ]™š[\ÊNÂˆ[œ]˜[YHHˆŽÂˆJNÂˆÈ™˜YÙ[\ˆ‹™˜YÛÝ™\ˆ—K™›Ü‘XXÚ
[˜Ý[Ûˆ
]ŠHÂˆ[˜Y]™[\Ý[™\Š]‹[˜Ý[Ûˆ
JHÈKœ™]™[Y˜][

NÈ[˜Û\ÜÓ\Ý˜Y
™˜YÛÝ™\ˆŠNÈJNÂˆJNÂˆÈ™˜YÛX]™H‹™›Ü—K™›Ü‘XXÚ
[˜Ý[Ûˆ
]ŠHÂˆ[˜Y]™[\Ý[™\Š]‹[˜Ý[Ûˆ
JHÈKœ™]™[Y˜][

NÈ[˜Û\ÜÓ\Ýœ™[[Ý™J™˜YÛÝ™\ˆŠNÈJNÂˆJNÂˆ[˜Y]™[\Ý[™\Š™›Ü‹[˜Ý[Ûˆ
JHÂˆYˆ
K™]U˜[œÙ™\ˆ	‰ˆK™]U˜[œÙ™\‹™š[\ÊH[™Qš[\ÊK™]U˜[œÙ™\‹™š[\ÊNÂˆJNÂ‚ˆÊˆ\ÝHÝ\ÜˆÝ›
Õˆ[XYÙ\Èœ›ÛHÛ\›Ø\™
‹ÂˆYˆ
ÜËœ\ÝHOOH˜[ÙJHÂˆØÝ[Y[˜Y]™[\Ý[™\Šœ\ÝH‹[˜Ý[Ûˆ
JHÂˆYˆ
K\™Ù]	‰ˆÒS”UVT‘PKË\Ý
K\™Ù]YÓ˜[YJH	‰ˆK\™Ù]\HOOH™š[HŠH™]\›ŽÂˆ˜\ˆ][\ÈHK˜Û\›Ø\™]H	‰ˆK˜Û\›Ø\™]Kš][\ÎÂˆYˆ
Z][\ÊH™]\›ŽÂˆ˜\ˆš[\ÈH×NÂˆ›Üˆ
˜\ˆHHÈH][\Ë›[™ÝÈJÊÊHÂˆYˆ
][\ÖÚWKšÚ[™OOH™š[HŠHÂˆ˜\ˆˆH][\ÖÚWK™Ù]\Ñš[J
NÂˆYˆ
ŠHš[\Ëœ\Ú
ŠNÂˆBˆBˆYˆ
š[\Ë›[™Ý
HÂˆKœ™]™[Y˜][

NÂˆ[™Q›Üš[\œÊš[\ËÜÊNÂˆBˆJNÂˆB‚ˆ[˜Ý[Ûˆ[™Q›Üš[\œÊš[\ËÊHÂˆYˆ
Ë˜XØÙ\
HÂˆ˜\ˆÚÈH™]È™YÑ^
Ë˜XØÙ\œ™\XÙJÖËŠŠÏ×‰ßJ
_×WKÙË—		ˆŠKšHŠNÂˆš[\ÈHš[\Ë™š[\Š[˜Ý[Ûˆ
ŠHÈ™]\›ˆÚË\Ý
‹\JHÚË\Ý
‹›˜[YJNÈJNÂˆBˆYˆ
š[\Ë›[™Ý
HË›Û‘š[\ÊË›][\HÈš[\Èˆš[\ËœÛXÙJJJNÂˆB‚ˆ™]\›ˆÈ[œ]ˆ[œ]NÂŸB‚‹ÊˆKKKKKKKKKHZ\ØÈ[\œÈKKKKKKKKKH
‹Â‚‹ÊˆœšY[™H˜[›™\ˆÚ[ˆH™[™Ü™YXœ˜\žH\È›Ý™Y[ˆ™]ÚYY]
‹Â™[˜Ý[ÛˆZ\ÜÚ[™ÓXŠX“˜[YJHÂˆ˜\ˆXYHØÝ[Y[œ]Y\žTÙ[XÝÜŠ‹ÛÛZXYŠHØÝ[Y[˜›ÙNÂˆXYš[œÙ\Y˜XÙ[S
˜Y\™[™‹ˆ]ˆÛ\ÜÏIÜ[™[\ÙÈ\œ‰ÈÝ[OIÙ\Ü^N˜›ØÚÉÏ¸¦¨;î#ÈHˆˆ
ÈX“˜[YH
ÂˆØˆXœ˜\žH\È›ÝØYYˆ[ˆÛÙO˜˜\ÚZ[œÚØÛÙOˆÛ˜ÙH
ÙYH‘PQQJHˆ
ÂˆÈÝÛ›ØYH™[™Ü™YXœ˜\šY\Ë[ˆ™[ØY\ÈYÙKÙ]ˆŠNÂŸB‚™[˜Ý[Ûˆ™XYš[P\Ð\œ˜^PY™™\Šš[JHÂˆ™]\›ˆ™]È›ÛZ\ÙJ[˜Ý[Ûˆ
™\ÛÛ™K™Z™XÝ
HÂˆ˜\ˆˆH™]Èš[T™XY\Š
NÂˆ‹›Û›ØYH[˜Ý[Ûˆ

HÈ™\ÛÛ™J‹œ™\Ý[
NÈNÂˆ‹›Û™\œ›ÜˆH[˜Ý[Ûˆ

HÈ™Z™XÝ
™]È\œ›ÜŠÛÝ[›Ý™XYˆ
Èš[K›˜[YJJNÈNÂˆ‹œ™XY\Ð\œ˜^PY™™\Šš[JNÂˆJNÂŸB‚™[˜Ý[Ûˆ™XYš[P\Ñ]UT“
š[JHÂˆ™]\›ˆ™]È›ÛZ\ÙJ[˜Ý[Ûˆ
™\ÛÛ™K™Z™XÝ
HÂÂˆ˜\ˆˆH™]Èš[T™XY\Š
NÂˆ‹›Û›ØYH[˜Ý[Ûˆ

HÈ™\ÛÛ™J‹œ™\Ý[
NÈNÂˆ‹›Û™\œ›ÜˆH[˜Ý[Ûˆ

HÈ™Z™XÝ
™]È\œ›ÜŠÛÝ[›Ý™XYˆ
Èš[K›˜[YJJNÈNÂˆ‹œ™XY\Ñ]UT“
š[JNÂˆJNÂŸB‚‹Êˆ›ÛÝ\ˆYX\ˆ
ÈÝ]\È[X™[
‹Â™ØÝ[Y[˜Y]™[\Ý[™\Š‘ÓPÛÛ[ØYY‹[˜Ý[Ûˆ

HÂˆ˜\ˆHHØÝ[Y[™Ù][[Y[žRY
žYX\ˆŠNÂˆYˆ
JHK^ÛÛ[H™]È]J
K™Ù][YX\Š
NÂˆØÝ[Y[œ]Y\žTÙ[XÝÜ[
‹œš]˜XÞK\[›X™[ŠK™›Ü‘XXÚ
[˜Ý[Ûˆ
[
HÂˆ[^ÛÛ[HŒL	HÛY[TÚYH[™Ú[™HXÝ]™HŽÂˆJNÂŸJNÂ