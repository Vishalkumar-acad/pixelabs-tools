/* Timezone world map — live day/night terminator, fully local.
   Draws an equirectangular world map (Natural Earth 50m land mask, public
   domain) and shades it by real solar position, so you can see which parts
   of the world are in daylight right now — or at any moment you convert to.
   Colours come from the site's CSS variables, so the map follows the
   light/dark theme automatically.

   Night is applied as a proportional multiply (not a flat overlay), so
   landmasses stay visible on the dark side instead of dissolving into the
   ocean. The day/night field is computed on a fixed low-resolution grid and
   scaled up — the terminator is a smooth curve, so this is just as smooth
   and stays fast on large screens. */
"use strict";

(function () {
  var canvas = document.getElementById("tzmap");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var statusEl = document.getElementById("tzmap-status");
  var tipEl = document.getElementById("tzmap-tip");

  var MASK_URL = "../assets/img/world-land.png";
  var maskImg = null, maskReady = false;

  /* The day/night field is computed at this size and stretched to the canvas. */
  var SHADE_W = 720, SHADE_H = 360;

  var RAD = Math.PI / 180;

  /* Representative city for each clock on the page (mirrors timezone.js). */
  var MARKERS = [
    { zone: "Asia/Kolkata",        lon: 88.36,   lat: 22.57 },
    { zone: "Asia/Dubai",          lon: 55.27,   lat: 25.20 },
    { zone: "Europe/London",       lon: -0.13,   lat: 51.51 },
    { zone: "America/New_York",    lon: -74.01,  lat: 40.71 },
    { zone: "America/Los_Angeles", lon: -118.24, lat: 34.05 },
    { zone: "America/Chicago",     lon: -87.63,  lat: 41.88 },
    { zone: "Asia/Singapore",      lon: 103.82,  lat: 1.35 },
    { zone: "Asia/Hong_Kong",      lon: 114.17,  lat: 22.32 },
    { zone: "Asia/Tokyo",          lon: 139.69,  lat: 35.69 },
    { zone: "Australia/Sydney",    lon: 151.21,  lat: -33.87 }
  ];

  var SHORT = {
    "Asia/Kolkata": "Kolkata",
    "Asia/Dubai": "Dubai",
    "Europe/London": "London",
    "America/New_York": "New York",
    "America/Los_Angeles": "Los Angeles",
    "America/Chicago": "Chicago",
    "Asia/Singapore": "Singapore",
    "Asia/Hong_Kong": "Hong Kong",
    "Asia/Tokyo": "Tokyo",
    "Australia/Sydney": "Sydney",
    "UTC": "UTC"
  };
  function shortName(zone) {
    if (SHORT[zone]) return SHORT[zone];
    var tail = String(zone || "").split("/").pop();
    return tail.replace(/_/g, " ");
  }

  var selectedZone = "Asia/Kolkata";
  var moment = null;          /* fixed Date, or null for "live now" */
  var timer = null;
  var hoverZone = null;
  var hoverCb = null;

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
      /* Day is laid on with "screen" (brightens), night with plain alpha
         (darkens). Doing both — rather than only darkening the night half —
         is what keeps the split obvious on a dark theme too, where the base
         map is already dark and a multiply would barely show. */
      day:    hexToRgb(css("--map-day", "#fff3d0")),
      dayA:   parseFloat(css("--map-day-a", "0.42")) || 0,
      night:  hexToRgb(css("--map-night", "#16204a")),
      nightA: parseFloat(css("--map-night-a", "0.74")) || 0,
      dot:    hexToRgb(css("--map-dot", "#3b4bd0")),
      dotRing: css("--map-dot-ring", "rgba(255,255,255,0.95)"),
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
    return { decRad: dec * RAD, decDeg: dec, lonS: lonS };
  }

  /* Is the sun above the horizon at this point, at this moment? */
  function sunAlt(lat, lon, when) {
    var s = solar(when);
    return Math.sin(lat * RAD) * Math.sin(s.decRad) +
           Math.cos(lat * RAD) * Math.cos(s.decRad) * Math.cos((lon - s.lonS) * RAD);
  }
  function markerFor(zone) {
    for (var i = 0; i < MARKERS.length; i++) if (MARKERS[i].zone === zone) return MARKERS[i];
    return null;
  }

  function project(lon, lat, W, H) {
    return { x: (lon + 180) / 360 * W, y: (90 - lat) / 180 * H };
  }
  function fmtLon(lon) {
    var l = ((lon + 180) % 360 + 360) % 360 - 180;
    return Math.abs(l).toFixed(1) + "\u00B0 " + (l >= 0 ? "E" : "W");
  }

  /* ---------- canvas sizing ---------- */
  function size() {
    var lowPower = document.documentElement.classList.contains("low-power");
    var dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 2);
    var cssW = canvas.clientWidth || canvas.parentNode.clientWidth || 640;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW / 2 * dpr);
    return { W: canvas.width, H: canvas.height, dpr: dpr };
  }

  /* ---------- day / night field (fixed grid, stretched to fit) ---------- */
  var shadeDay = null, shadeNight = null;
  function buildShade(when, p) {
    if (!shadeDay) {
      shadeDay = document.createElement("canvas");
      shadeNight = document.createElement("canvas");
      shadeDay.width = shadeNight.width = SHADE_W;
      shadeDay.height = shadeNight.height = SHADE_H;
    }
    var s = solar(when);
    var sinDec = Math.sin(s.decRad), cosDec = Math.cos(s.decRad);
    var sinlat = new Float32Array(SHADE_H), coslat = new Float32Array(SHADE_H);
    for (var y = 0; y < SHADE_H; y++) {
      var lat = RAD * (90 - (y + 0.5) / SHADE_H * 180);
      sinlat[y] = Math.sin(lat); coslat[y] = Math.cos(lat);
    }
    var cosH = new Float32Array(SHADE_W);
    for (var x = 0; x < SHADE_W; x++) {
      cosH[x] = Math.cos(RAD * ((x + 0.5) / SHADE_W * 360 - 180 - s.lonS));
    }

    var dctx = shadeDay.getContext("2d"), nctx = shadeNight.getContext("2d");
    var di = dctx.createImageData(SHADE_W, SHADE_H), dd = di.data;
    var ni = nctx.createImageData(SHADE_W, SHADE_H), nd = ni.data;
    var dr = p.day[0], dg = p.day[1], db = p.day[2];
    var nr = p.night[0], ng = p.night[1], nb = p.night[2];
    var i = 0;
    for (var yy = 0; yy < SHADE_H; yy++) {
      var sl = sinlat[yy], cl = coslat[yy];
      for (var xx = 0; xx < SHADE_W; xx++) {
        var sa = sl * sinDec + cl * cosDec * cosH[xx];
        if (sa >= 0) {
          dd[i] = dr; dd[i + 1] = dg; dd[i + 2] = db;
          dd[i + 3] = p.dayA * Math.min(1, sa / 0.20) * 255;
          nd[i + 3] = 0;
        } else {
          dd[i + 3] = 0;
          nd[i] = nr; nd[i + 1] = ng; nd[i + 2] = nb;
          nd[i + 3] = p.nightA * Math.min(1, (-sa) / 0.13) * 255;
        }
        i += 4;
      }
    }
    dctx.putImageData(di, 0, 0);
    nctx.putImageData(ni, 0, 0);
  }

  /* ---------- city labels (only when there is room) ---------- */
  function drawLabels(W, H, scale, p, when) {
    if (W / scale < 620) return;                   /* too tight on a phone */
    ctx.font = "600 " + Math.round(11 * scale) + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    /* A thick halo (not a thin outline) is what keeps a dark label readable
       over the dark half of the map as well as the bright half. */
    ctx.lineWidth = 4 * scale;
    ctx.miterLimit = 2;
    /* A city in daylight gets dark ink on a light halo; a city in the dark
       (or in the twilight band) gets light ink on a dark halo. That way every
       label stays readable whichever half of the map it happens to sit on. */
    var haloDay = css("--map-label-halo", "rgba(255,255,255,0.96)");
    var inkDay = css("--map-label", "#101527");
    var haloNight = css("--map-label-night-halo", "rgba(2,5,12,0.92)");
    var inkNight = css("--map-label-night", "#f0f4ff");
    var taken = [];
    MARKERS.forEach(function (m) {
      var pt = project(m.lon, m.lat, W, H);
      var text = shortName(m.zone);
      var tw = ctx.measureText(text).width;
      var x = pt.x + 8 * scale, y = pt.y;
      var box = { x: x - 2 * scale, y: y - 9 * scale, w: tw + 4 * scale, h: 18 * scale };
      for (var k = 0; k < taken.length; k++) {
        var t = taken[k];
        if (box.x < t.x + t.w && box.x + box.w > t.x &&
            box.y < t.y + t.h && box.y + box.h > t.y) return;   /* would collide */
      }
      taken.push(box);
      var lit = sunAlt(m.lat, m.lon, when) > 0.06;
      ctx.strokeStyle = lit ? haloDay : haloNight;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = lit ? inkDay : inkNight;
      ctx.fillText(text, x, y);
    });
  }

  /* ---------- render ---------- */
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

    /* day / night */
    buildShade(when, p);
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    ctx.globalCompositeOperation = "screen";                    /* daylight: brighten */
    ctx.drawImage(shadeDay, 0, 0, W, H);
    ctx.restore();
    ctx.drawImage(shadeNight, 0, 0, W, H);                      /* night: darken */

    /* city markers */
    MARKERS.forEach(function (m) {
      var pt = project(m.lon, m.lat, W, H);
      var sel = m.zone === selectedZone;
      var hot = m.zone === hoverZone;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (sel || hot ? 6 : 4.5) * scale, 0, Math.PI * 2);
      ctx.fillStyle = rgb(sel || hot ? p.sel : p.dot);
      ctx.fill();
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = p.dotRing;
      ctx.stroke();
    });

    /* city names — skipped automatically where they would overlap */
    drawLabels(W, H, scale, p, when);

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

    if (hoverZone) showTip(hoverZone);   /* keep an open tooltip in step */
  }

  /* ---------- tooltip / hover ---------- */
  function timeIn(zone, when) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit"
      }).format(when);
    } catch (e) { return ""; }
  }

  function showTip(zone) {
    if (!tipEl) return;
    var m = markerFor(zone);
    if (!m) return;
    var when = moment || new Date();
    var day = sunAlt(m.lat, m.lon, when) >= 0;
    var rect = canvas.getBoundingClientRect();
    var pt = project(m.lon, m.lat, canvas.width, canvas.height);
    tipEl.innerHTML = "<b>" + shortName(zone) + "</b>" +
      "<span class='t'>" + (day ? "\u2600\uFE0F " : "\uD83C\uDF19 ") + timeIn(zone, when) + "</span>" +
      "<span class='sub'>" + (day ? "daylight" : "night") + "</span>";
    tipEl.hidden = false;
    var x = pt.x / canvas.width * rect.width;
    var y = pt.y / canvas.height * rect.height;
    tipEl.style.left = Math.max(52, Math.min(rect.width - 52, x)) + "px";
    tipEl.style.top = Math.max(34, y) + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  function setHover(zone) {
    if (zone === hoverZone) return;
    hoverZone = zone;
    if (hoverCb) { try { hoverCb(zone); } catch (err) {} }
    draw();
  }

  function zoneAt(e) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !canvas.width) return null;
    var sx = canvas.width / rect.width;
    var px = (e.clientX - rect.left) * sx;
    var py = (e.clientY - rect.top) * (canvas.height / rect.height);
    var thr = 22 * sx, best = null, bestD = Infinity;
    MARKERS.forEach(function (m) {
      var pt = project(m.lon, m.lat, canvas.width, canvas.height);
      var dx = pt.x - px, dy = pt.y - py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < thr && dist < bestD) { bestD = dist; best = m; }
    });
    return best ? best.zone : null;
  }

  canvas.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    var z = zoneAt(e);
    canvas.style.cursor = z ? "pointer" : "default";
    setHover(z);
    if (!z) hideTip();
  });
  canvas.addEventListener("pointerdown", function (e) {
    var z = zoneAt(e);
    setHover(z);
    if (z) { showTip(z); if (e.pointerType === "touch") e.preventDefault(); }
    else hideTip();
  });
  canvas.addEventListener("pointerleave", function (e) {
    if (e.pointerType === "touch") return;     /* a tap should keep its tooltip */
    hideTip();
    setHover(null);
  });

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

  window.TZMap = {
    setMoment: setMoment,
    highlight: highlight,
    redraw: draw,
    /* is it daylight at this zone's city, at this moment (default: now)? */
    isDayAt: function (zone, when) {
      var m = markerFor(zone);
      if (!m) return null;
      return sunAlt(m.lat, m.lon, when || moment || new Date()) >= 0;
    },
    shortName: shortName,
    /* tell me when the pointer moves onto / off a city (null = off) */
    onHover: function (cb) { hoverCb = cb; }
  };
})();
