/* Timezone Converter — Intl API, fully local */
"use strict";

(function () {

  var els = {
    dt: document.getElementById("dt"),
    from: document.getElementById("from"),
    results: document.getElementById("results"),
    now: document.getElementById("now-btn"),
    clocks: document.getElementById("clocks")
  };

  var ZONES = [
    ["Kolkata (IST)", "Asia/Kolkata"],
    ["Dubai (GST)", "Asia/Dubai"],
    ["London (GMT/BST)", "Europe/London"],
    ["New York (EST/EDT)", "America/New_York"],
    ["Los Angeles (PST/PDT)", "America/Los_Angeles"],
    ["Chicago (CST/CDT)", "America/Chicago"],
    ["Singapore (SGT)", "Asia/Singapore"],
    ["Hong Kong (HKT)", "Asia/Hong_Kong"],
    ["Tokyo (JST)", "Asia/Tokyo"],
    ["Sydney (AEST/AEDT)", "Australia/Sydney"],
    ["UTC", "UTC"]
  ];

  ZONES.forEach(function (z, i) {
    var opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = z[0];
    els.from.appendChild(opt);
    if (z[1] === "Asia/Kolkata") els.from.value = String(i);
  });
  if (window.TZMap) TZMap.highlight(ZONES[parseInt(els.from.value, 10)][1]);

  /* --- time math: interpret a local wall-clock time in a zone --- */
  function zonedTimeToUTC(wall, zone) {
    /* wall = Date created as if that wall time were local; correct it by the zone offset twice */
    var guess = new Date(wall.getTime());
    for (var pass = 0; pass < 3; pass++) {
      var offset = zoneOffsetMs(guess, zone);
      var candidate = new Date(wall.getTime() - offset);
      if (candidate.getTime() === guess.getTime()) break;
      guess = candidate;
    }
    return new Date(wall.getTime() - zoneOffsetMs(guess, zone));
  }

  function zoneOffsetMs(date, zone) {
    try {
      var dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      var parts = dtf.formatToParts(date).reduce(function (acc, p) { acc[p.type] = p.value; return acc; }, {});
      var asUTC = Date.UTC(parts.year, parts.month - 1, parts.day,
        parts.hour === "24" ? 0 : parts.hour, parts.minute, parts.second);
      return asUTC - date.getTime();
    } catch (e) { return 0; }
  }

  function fmt(date, zone, withDate) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      weekday: withDate ? "short" : undefined,
      year: withDate ? "numeric" : undefined,
      month: withDate ? "short" : undefined,
      day: withDate ? "numeric" : undefined,
      hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function convert() {
    var val = els.dt.value;
    if (!val) { els.results.innerHTML = ""; if (window.TZMap) TZMap.setMoment(null); return; }
    /* Parse the wall-clock value straight from the field (YYYY-MM-DDTHH:MM)
       and build a UTC-based Date, so the result never depends on the
       browser's own timezone (which previously shifted every conversion by
       the local UTC offset). */
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(val);
    if (!m) { els.results.innerHTML = ""; if (window.TZMap) TZMap.setMoment(null); return; }
    var wall = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    var fromZone = ZONES[parseInt(els.from.value, 10)][1];
    var utc = zonedTimeToUTC(wall, fromZone);
    if (window.TZMap) TZMap.setMoment(utc);

    els.results.innerHTML = "";
    ZONES.forEach(function (z) {
      var isFrom = z[1] === fromZone;
      var row = document.createElement("div");
      row.className = "file-row" + (isFrom ? " done" : "");
      row.innerHTML = '<div class="meta"><div class="name"></div><div class="size"></div></div>';
      row.querySelector(".name").textContent = z[0] + (isFrom ? "  (source)" : "");
      row.querySelector(".size").textContent = fmt(utc, z[1], true);
      els.results.appendChild(row);
    });
  }

  els.now.addEventListener("click", function () {
    var now = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var fromZone = ZONES[parseInt(els.from.value, 10)][1];
    var off = zoneOffsetMs(now, fromZone);
    var local = new Date(now.getTime() + off);
    els.dt.value = local.getUTCFullYear() + "-" + pad(local.getUTCMonth() + 1) + "-" + pad(local.getUTCDate()) +
      "T" + pad(local.getUTCHours()) + ":" + pad(local.getUTCMinutes());
    convert();
  });

  els.dt.addEventListener("input", convert);
  /* Some mobile date/time pickers fire only "change", never "input" — listen
     to both so the results list and the world map never go stale. */
  els.dt.addEventListener("change", convert);
  els.from.addEventListener("change", function () {
    if (window.TZMap) TZMap.highlight(ZONES[parseInt(els.from.value, 10)][1]);
    convert();
  });

  /* Mobile safety net: if the value is edited while the tab is backgrounded
     (or an event is missed), re-run the conversion whenever we regain focus,
     so the results list and the world map can never be left showing a stale
     moment. */
  document.addEventListener("visibilitychange", function () { if (!document.hidden) convert(); });
  window.addEventListener("focus", convert);

  /* A sun/moon badge, so "is it day or night there?" reads at a glance,
     without reading a single number. It comes from the same solar maths the
     map uses, so the list and the map can never disagree. */
  function dayBadge(zone, when) {
    var span = document.createElement("span");
    span.className = "dn";
    var day = (window.TZMap && TZMap.isDayAt) ? TZMap.isDayAt(zone, when) : null;
    if (day === null) return span;
    span.textContent = day ? "\u2600\uFE0F" : "🌙";
    span.title = day ? "Daytime there" : "Night there";
    span.setAttribute("aria-label", day ? "daytime" : "night");
    return span;
  }

  /* live clocks */
  function tickClocks() {
    var now = new Date();
    els.clocks.innerHTML = "";
    ZONES.forEach(function (z) {
      var row = document.createElement("div");
      row.className = "file-row";
      row.setAttribute("data-zone", z[1]);
      row.innerHTML = '<div class="meta"><div class="name"></div><div class="size"></div></div>';
      var nameEl = row.querySelector(".name");
      nameEl.textContent = z[0];
      nameEl.appendChild(dayBadge(z[1], now));
      var t = fmt(now, z[1], false);
      var d = new Intl.DateTimeFormat(undefined, { timeZone: z[1], month: "short", day: "numeric" }).format(now);
      row.querySelector(".size").textContent = d + " \u00B7 " + t;
      els.clocks.appendChild(row);
    });
  }
  tickClocks();
  setInterval(tickClocks, 30000);

  /* Pointing at a city on the map lights up its row here, so the two halves
     of the page read as one thing. */
  if (window.TZMap && TZMap.onHover) {
    TZMap.onHover(function (zone) {
      var rows = els.clocks.querySelectorAll(".file-row");
      for (var k = 0; k < rows.length; k++) {
        rows[k].classList.toggle("hover", !!zone && rows[k].getAttribute("data-zone") === zone);
      }
    });
  }

})();
