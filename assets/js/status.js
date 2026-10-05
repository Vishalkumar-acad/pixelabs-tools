/* ============================================================
   Cloud Status — live uptime of the optional cloud services
   ------------------------------------------------------------
   Fetches /api/uptime (our worker proxies + reshapes the public
   Better Stack status page JSON — no API key, public data) and
   renders a branded status page. Auto-refreshes every 60 s.
   Source of truth: https://status.pixelabs.in/
   ============================================================ */
(function () {
  "use strict";

  var REFRESH_MS = 60000;

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

  /* How each Better Stack status maps to a label, badge class and bar colour. */
  var STATUS_META = {
    operational:   { label: "Operational",   cls: "up",   bar: "g" },
    degraded:      { label: "Degraded",      cls: "down", bar: "y" },
    downtime:      { label: "Down",          cls: "down", bar: "r" },
    maintenance:   { label: "Maintenance",   cls: "off",  bar: "y" },
    not_monitored: { label: "Not monitored", cls: "off",  bar: "" }
  };
  function meta(s) { return STATUS_META[s] || STATUS_META.not_monitored; }

  function badge(s) {
    var m = meta(s);
    return '<span class="badge ' + m.cls + '">' + m.label + "</span>";
  }

  function bars(history) {
    if (!history || !history.length) return "";
    var days = history.slice(-90);
    var html = days.map(function (h) {
      var m = meta(h.status);
      return '<i class="' + m.bar + '" title="' + h.day + " \u2014 " + m.label + '"></i>';
    }).join("");
    return '<div class="bars" aria-hidden="true">' + html + "</div>" +
      '<div class="bars-scale"><span>' + days.length + " days ago</span><span>today</span></div>";
  }

  function serviceHtml(sv) {
    var upt = (sv.availability === null || sv.availability === undefined)
      ? "\u2014" : sv.availability.toFixed(3) + "%";
    return '<div class="panel mon-card">' +
      '<div class="mon-head">' +
        "<div><div class=\"mon-name\">" + esc(sv.name) + "</div>" +
        (sv.note ? '<div class="mon-host">' + esc(sv.note) + "</div>" : "") +
        "</div>" + badge(sv.status) +
      "</div>" +
      '<div class="stats-row">' +
        '<div class="stat"><div class="k">Now</div><div class="v">' + meta(sv.status).label + "</div></div>" +
        '<div class="stat"><div class="k">Uptime (90 days)</div><div class="v">' + upt + "</div></div>" +
      "</div>" +
      bars(sv.history) +
      "</div>";
  }

  function render(j) {
    var banner = document.getElementById("maint-banner");
    if (banner && j && j.announcement) {
      document.getElementById("maint-head").textContent = "\uD83D\uDCE3 " + (j.company || "Service status");
      document.getElementById("maint-body").textContent = j.announcement;
      document.getElementById("maint-foot").textContent = "";
      banner.hidden = false;
    }

    var sections = (j && j.sections) || [];
    if (!sections.length) {
      hero("off", "No cloud services tracked yet", "The status page has no services yet.");
      monitorsEl.innerHTML = "";
      return;
    }

    var total = 0, bad = 0;
    sections.forEach(function (sec) {
      (sec.services || []).forEach(function (sv) {
        total++;
        if (sv.status === "downtime" || sv.status === "degraded") bad++;
      });
    });

    var when = " \u00B7 updated " + timeStr();
    if (bad > 0) {
      hero("bad", bad + " service" + (bad > 1 ? "s" : "") + " affected",
        "Some cloud operations may be unavailable. Local tools keep working." + when);
    } else {
      hero("ok", "All cloud services operational",
        total + " monitored service" + (total > 1 ? "s" : "") + " up" + when);
    }

    monitorsEl.innerHTML = sections.map(function (sec) {
      return '<h2 class="sec-title">' + esc(sec.name) + "</h2>" +
        (sec.services || []).map(serviceHtml).join("");
    }).join("");
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
          if (sub) sub.textContent = "Can't reach the status feed \u2014 showing last known data";
        } else if (failCount > 1) {
          hero("off", "Status unavailable",
            "Can't reach the status feed right now. Local tools are unaffected.");
        }
      });
  }

  load();
  setInterval(load, REFRESH_MS);
})();
