/* ============================================================
   Cloud Status — live uptime of the optional cloud services
   ------------------------------------------------------------
   Fetches /api/uptime (our worker proxies the public
   UptimeRobot status page JSON — no API key, public data) and
   renders a branded status page. Auto-refreshes every 60 s.
   ============================================================ */
(function () {
  "use strict";

  var REFRESH_MS = 60000;
  var PSP_URL = "https://stats.uptimerobot.com/qyIKoElOfT";

  /* ---------- maintenance switch ----------
     While the processing server is being worked on, cloud mode cannot
     run — so the page says that plainly at the top instead of leaving
     visitors with a red "down" and no explanation. To end it, flip
     `on` to false (that one word is the whole change). */
  var MAINTENANCE = {
    on: false,
    head: "🛠️ Cloud processing is temporarily unavailable",
    body: "We are doing maintenance on the cloud processing server, so <b>Cloud mode will not work right now</b>. Nothing else changes — every tool still runs <b>on your device</b> in Local mode, your files never leave it, and nothing is uploaded.",
    foot: "This page will be updated as soon as cloud processing is back."
  };

  /* Show the notice before the live data arrives. */
  (function showMaintenance() {
    if (!MAINTENANCE.on) return;
    var box = document.getElementById("maint-banner");
    if (!box) return;
    var head = document.getElementById("maint-head");
    var body = document.getElementById("maint-body");
    var foot = document.getElementById("maint-foot");
    if (head) head.textContent = MAINTENANCE.head;
    if (body) body.innerHTML = MAINTENANCE.body;
    if (foot) foot.textContent = MAINTENANCE.foot;
    box.hidden = false;
  })();

  var heroDot = document.getElementById("hero-dot");
  var heroTitle = document.getElementById("hero-title");
  var heroSub = document.getElementById("hero-sub");
  var monitorsEl = document.getElementById("monitors");
  var lastGood = null;
  var failCount = 0;

  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(String(s)) : String(s);
  }

  function timeStr() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function hero(state, title, sub) {
    heroDot.className = "dot-big " + state;
    heroTitle.textContent = title;
    heroSub.textContent = sub;
  }

  function badgeFor(m) {
    if (m.statusClass === "success") return '<span class="badge up">Operational</span>';
    if (m.statusClass === "danger") return '<span class="badge down">Down</span>';
    if (m.statusClass === "paused") return '<span class="badge off">Paused</span>';
    return '<span class="badge off">Unknown</span>';
  }

  function barsHtml(dailyRatios) {
    if (!dailyRatios || !dailyRatios.length) return "";
    var bars = dailyRatios.map(function (d) {
      var cls = d.color === "green" ? "g" : (d.color === "red" ? "r" : (d.color === "yellow" ? "y" : ""));
      var ratio = parseFloat(d.ratio) || 0;
      var label = (d.label === "black" ? "no data" : ratio.toFixed(2) + "% uptime");
      return '<i class="' + cls + '" title="' + d.date + " — " + label + '"></i>';
    }).join("");
    return '<div class="bars" aria-hidden="true">' + bars + "</div>" +
      '<div class="bars-scale"><span>' +
      dailyRatios.length + " days ago</span><span>today</span></div>";
  }

  function monHtml(m) {
    var ratio = m.ratio && m.ratio.ratio ? m.ratio.ratio : "—";
    var r30 = m["30dRatio"] && m["30dRatio"].ratio ? m["30dRatio"].ratio : "—";
    var r90 = m["90dRatio"] && m["90dRatio"].ratio ? m["90dRatio"].ratio : "—";
    var lastDown = "No downtime on record";
    if (m.lastDowntime && m.lastDowntime.datetime) {
      lastDown = "Last downtime: " + m.lastDowntime.datetime;
    }
    var since = m.createdAt ? " · monitored since " + m.createdAt.split(" ")[0] : "";
    return '' +
      '<div class="panel mon-card">' +
        '<div class="mon-head">' +
          '<div><div class="mon-name">' + esc(m.name) + "</div>" +
          '<div class="mon-host">' + esc(m.name) + " · " + esc(m.type || "monitor") + since + "</div></div>" +
          badgeFor(m) +
        "</div>" +
        '<div class="stats-row">' +
          '<div class="stat"><div class="k">Now</div><div class="v">' +
            (m.statusClass === "success" ? "Up" : (m.statusClass === "danger" ? "Down" : (m.statusClass === "paused" ? "Paused" : "?"))) + "</div></div>" +
          '<div class="stat"><div class="k">30-day uptime</div><div class="v">' + r30 + "%</div></div>" +
          '<div class="stat"><div class="k">90-day uptime</div><div class="v">' + r90 + "%</div></div>" +
          '<div class="stat"><div class="k">All-time</div><div class="v">' + ratio + "%</div></div>" +
        "</div>" +
        barsHtml(m.dailyRatios) +
        '<div class="mon-meta">' + lastDown + "</div>" +
      "</div>";
  }

  function render(j) {
    var monitors = (j && j.data) || [];
    if (!monitors.length) {
      hero("off", "No cloud services tracked yet",
        "UptimeRobot has no monitors on this status page right now.");
      monitorsEl.innerHTML = "";
      return;
    }
    var up = 0, down = 0, paused = 0;
    monitors.forEach(function (m) {
      if (m.statusClass === "success") up++;
      else if (m.statusClass === "danger") down++;
      else if (m.statusClass === "paused") paused++;
    });

    if (MAINTENANCE.on) {
      hero("warn", "Cloud processing is paused for maintenance",
        "Local mode is unaffected — every tool still runs on your device. Updated " + timeStr());
    } else if (down > 0) {
      hero("bad", down + " service" + (down > 1 ? "s" : "") + " down",
        "Some cloud operations may be unavailable. Local tools keep working.");
    } else if (up > 0) {
      hero("ok", "All cloud services operational",
        up + " monitored service" + (up > 1 ? "s" : "") + " up · updated " + timeStr());
    } else {
      hero("off", "All services paused", "Monitoring is paused · updated " + timeStr());
    }

    monitorsEl.innerHTML = monitors.map(monHtml).join("");

    var stale = document.getElementById("stale-note");
    if (stale) stale.style.display = "none";
  }

  function load() {
    fetch("/api/uptime", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (j) {
        lastGood = j;
        failCount = 0;
        render(j);
      })
      .catch(function () {
        failCount++;
        if (lastGood) {
          render(lastGood);
          var sub = document.getElementById("hero-sub");
          if (sub) sub.textContent = "Can't reach the status feed — showing last known data";
        } else if (failCount > 1) {
          hero("off", "Status unavailable",
            "Can't reach the uptime feed right now. Local tools are unaffected.");
        }
      });
  }

  load();
  setInterval(load, REFRESH_MS);
})();
