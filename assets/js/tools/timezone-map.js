/* Timezone world map — live day/night terminator, fully local.
   Draws an equirectangular world map (Natural Earth 110m land mask,
   public domain) and shades it by real solar position, so you can see
   which parts of the world are in daylight right now — or at any moment
   you convert to. Colours come from the site's CSS variables, so the map
   follows the light/dark theme automatically.

   Night is applied as a proportional multiply (not a flat overlay), so
   landmasses stay visible on the dark side instead of dissolving into
   the ocean. */
"use strict";

(function () {
  var canvas = document.getElementById("tzmap");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var statusEl = document.getElementById("tzmap-status");

  var MASK_URL = "../assets/img/world-land.png";
  var maskImg = null, maskReady = false;

  /* Representative city for each clock on the page (mirrors timezone.js). */
  var MARKERS = [
    { zone: "Asia/Kolkata",        lon: 88.36,  lat: 22.57 },
    { zone: "Asia/Dubai",          lon: 55.27,  lat: 25.20 },
    { zone: "Europe/London",       lon: -0.13,  lat: 51.51 },
    { zone: "America/New_York",    lon: -74.01, lat: 40.71 },
    { zone: "America/Los_Angeles", lon: -118.24, lat: 34.05 },
    { zone: "America/Chicago",     lon: -87.63, lat: 41.88 },
    { zone: "Asia/Singapore",      lon: 103.82, lat: 1.35 },
    { zone: "Asia/Hong_Kong",      lon: 114.17, lat: 22.32 },
    { zone: "Asia/Tokyo",          lon: 139.69, lat: 35.69 },
    { zone: "Australia/Sydney",    lon: 151.21, lat: -33.87 }
  ];

  var selectedZone = "Asia/Kolkata";
  var moment = null;          /* fixed Date, or null for "live now" */
  var timer = null;

  /* ---------- theme ---------- */
  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v || "").trim() || fallback;
  }
  function hexToRgb(h) {
    h = String(h || "").replace("#", "").trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function palette() {
    return {
      ocean:  hexToRgb(css("--map-ocean", "#f2f4fc")),
      land:   hexToRgb(css("--map-land", "#aab6d6")),
      nightA: parseFloat(css("--map-night-a", "0.58")) || 0,   /* strength 0..1 */
      day:    hexToRgb(css("--map-day", "#ffe9b0")),
      dayA:   parseFloat(css("--map-day-a", "0.16")) || 0,
      dot:    hexToRgb(css("--map-dot", "#2b3556")),
      sel:    hexToRgb(css("--map-dot-sel", "#6366f1")),
      sun:    hexToRgb(css("--map-sun", "#f59e0b"))
    };
  }
  function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }

  /* ---------- solar position (subsolar point) ---------- */
  function solar(utc) {
    var doy = Math.floor((utc.getTime() - Date.UTC(utc.getUTCFullYear(), 0, 0)) / 86400000);
    var dec = -23.44 * Math.cos(Math.PI / 180 * 360 * (doy + 10) / 365);  /* degrees */
    var B = Math.PI / 180 * 360 * (doy - 81) / 365;
    var eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); /* minutes */
    var utcH = utc.getUTCHours() + utc.getUTCMinutes() / 60 + utc.getUTCSeconds() / 3600;
    var lonS = -15 * (utcH + eot / 60 - 12);   /* sub-solar longitude, degrees */
    return { decRad: dec * Math.PI / 180, decDeg: dec, lonS: lonS };
  }

  function project(lon, lat, W, H) {
    return { x: (lon + 180) / 360 * W, y: (90 - lat) / 180 * H };
  }
  function fmtLon(lon) {
    var l = ((lon + 180) % 360 + 360) % 360 - 180;
    return Math.abs(l).toFixed(1) + "\u00B0 " + (l >= 0 ? "E" : "W");
  }

  /* ---------- render ---------- */
  function size() {
    var lowPower = document.documentElement.classList.contains("low-power");
    var dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 2);
    var cssW = canvas.clientWidth || canvas.parentNode.clientWidth || 640;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW / 2 * dpr);
    return { W: canvas.width, H: canvas.height, dpr: dpr };
  }

  function draw() {
    if (!maskReady) return;
    var d = size(), W = d.W, H = d.H, scale = d.dpr;
    var p = palette();
    var when = moment || new Date();
    var s = solar(when);

    /* ocean */
    ctx.fillStyle = rgb(p.ocean);
    ctx.fillRect(0, 0, W, H);

    /* land, tinted to the theme's land colour, with a soft edge */
    var land = document.createElement("canvas");
    land.width = W; land.height = H;
    var lc = land.getContext("2d");
    lc.drawImage(maskImg, 0, 0, W, H);
    lc.globalCompositeOperation = "source-in";
    lc.fillStyle = rgb(p.land);
    lc.fillRect(0, 0, W, H);
    ctx.save();
    ctx.shadowColor = css("--map-edge", "rgba(31,41,74,0.38)");
    ctx.shadowBlur = 4 * scale;
    ctx.shadowOffsetY = 1 * scale;
    ctx.drawImage(land, 0, 0);
    ctx.restore();

    /* --- day / night, computed per pixel from solar elevation --- */
    var sinDec = Math.sin(s.decRad), cosDec = Math.cos(s.decRad);
    var sinlat = new Float32Array(H), coslat = new Float32Array(H);
    for (var y = 0; y < H; y++) {
      var lat = Math.PI / 180 * (90 - (y + 0.5) / H * 180);
      sinlat[y] = Math.sin(lat); coslat[y] = Math.cos(lat);
    }
    var cosH = new Float32Array(W);
    for (var x = 0; x < W; x++) {
      var lon = (x + 0.5) / W * 360 - 180;
      cosH[x] = Math.cos(Math.PI / 180 * (lon - s.lonS));
    }

    var dayC = document.createElement("canvas"); dayC.width = W; dayC.height = H;
    var dc = dayC.getContext("2d");
    var dayImg = dc.createImageData(W, H), dd = dayImg.data;

    var nightC = document.createElement("canvas"); nightC.width = W; nightC.height = H;
    var nc = nightC.getContext("2d");
    var nightImg = nc.createImageData(W, H), nd = nightImg.data;

    var dr = p.day[0], dg = p.day[1], db = p.day[2];
    var g = Math.round(255 * (1 - p.nightA));   /* multiply grey for full night */
    var i = 0;
    for (var yy = 0; yy < H; yy++) {
      var sl = sinlat[yy], cl = coslat[yy];
      for (var xx = 0; xx < W; xx++) {
        var sa = sl * sinDec + cl * cosDec * cosH[xx];
        if (sa >= 0) {
          dd[i] = dr; dd[i + 1] = dg; dd[i + 2] = db;
          dd[i + 3] = p.dayA * Math.min(1, sa / 0.20) * 255;
          nd[i + 3] = 0;
        } else {
          dd[i + 3] = 0;
          nd[i] = g; nd[i + 1] = g; nd[i + 2] = g;
          nd[i + 3] = Math.min(1, (-sa) / 0.13) * 255;
        }
        i += 4;
      }
    }
    dc.putImageData(dayImg, 0, 0);
    nc.putImageData(nightImg, 0, 0);
    ctx.drawImage(dayC, 0, 0);                                  /* warm daylight */
    ctx.save();
    ctx.globalCompositeOperation = "multiply";                  /* proportional night */
    ctx.drawImage(nightC, 0, 0);
    ctx.restore();

    /* city markers */
    MARKERS.forEach(function (m) {
      var pt = project(m.lon, m.lat, W, H);
      var sel = m.zone === selectedZone;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (sel ? 6 : 4.5) * scale, 0, Math.PI * 2);
      ctx.fillStyle = rgb(sel ? p.sel : p.dot);
      ctx.fill();
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.stroke();
    });

    /* sun marker at the sub-solar point */
    var sp = project(s.lonS, s.decDeg, W, H);
    var sr = 7 * scale;
    var grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, sr * 2.6);
    grad.addColorStop(0, "rgba(" + p.sun[0] + "," + p.sun[1] + "," + p.sun[2] + ",0.55)");
    grad.addColorStop(1, "rgba(" + p.sun[0] + "," + p.sun[1] + "," + p.sun[2] + ",0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, sr * 2.6, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = rgb(p.sun);
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = "round";
    for (var k = 0; k < 8; k++) {
      var ang = k * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(sp.x + Math.cos(ang) * sr * 1.5, sp.y + Math.sin(ang) * sr * 1.5);
      ctx.lineTo(sp.x + Math.cos(ang) * sr * 2.1, sp.y + Math.sin(ang) * sr * 2.1);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(sp.x, sp.y, sr, 0, Math.PI * 2);
    ctx.fillStyle = rgb(p.sun); ctx.fill();
    ctx.lineWidth = 2 * scale; ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.stroke();

    if (statusEl) {
      var t = new Intl.DateTimeFormat(undefined, { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(when);
      statusEl.textContent = "Sun overhead at " + Math.abs(s.decDeg).toFixed(1) + "\u00B0 " +
        (s.decDeg >= 0 ? "N" : "S") + ", " + fmtLon(s.lonS) + " \u00B7 " + t + " UTC" +
        (moment ? " (converted moment)" : " \u00B7 live");
    }
  }

  /* ---------- public API ---------- */
  function setMoment(date) {
    moment = date || null;
    stopTimer();
    if (!moment) startTimer();
    draw();
  }
  function highlight(zone) { selectedZone = zone; draw(); }
  function startTimer() { stopTimer(); timer = setInterval(function () { if (!moment) draw(); }, 60000); }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  /* ---------- init ---------- */
  var img = new Image();
  img.onload = function () {
    maskImg = img; maskReady = true;
    /* draw on the next frame so the canvas has its final laid-out size */
    requestAnimationFrame(function () { draw(); startTimer(); });
  };
  img.onerror = function () { if (statusEl) statusEl.textContent = "Map image unavailable."; };
  img.src = MASK_URL;

  window.addEventListener("resize", function () { draw(); });
  window.addEventListener("load", function () { if (maskReady) draw(); });

  /* repaint when the light/dark theme flips (html.dark toggled) */
  if (window.MutationObserver) {
    new MutationObserver(function () { draw(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  window.TZMap = { setMoment: setMoment, highlight: highlight, redraw: draw };
})();
