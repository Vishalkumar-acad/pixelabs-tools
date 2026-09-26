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
    if (!val) { els.results.innerHTML = ""; return; }
    var wall = new Date(val);
    if (isNaN(wall.getTime())) { els.results.innerHTML = ""; return; }
    var fromZone = ZONES[parseInt(els.from.value, 10)][1];
    var utc = zonedTimeToUTC(wall, fromZone);

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
    els.dt.value = local.getFullYear() + "-" + pad(local.getMonth() + 1) + "-" + pad(local.getDate()) +
      "T" + pad(local.getHours()) + ":" + pad(local.getMinutes());
    convert();
  });

  els.dt.addEventListener("input", convert);
  els.from.addEventListener("change", convert);

  /* live clocks */
  function tickClocks() {
    var now = new Date();
    els.clocks.innerHTML = "";
    ZONES.forEach(function (z) {
      var row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = '<div class="meta"><div class="name"></div><div class="size"></div></div>';
      row.querySelector(".name").textContent = z[0];
      var t = fmt(now, z[1], false);
      var d = new Intl.DateTimeFormat(undefined, { timeZone: z[1], month: "short", day: "numeric" }).format(now);
      row.querySelector(".size").textContent = d + " · " + t;
      els.clocks.appendChild(row);
    });
  }
  tickClocks();
  setInterval(tickClocks, 30000);

})();
