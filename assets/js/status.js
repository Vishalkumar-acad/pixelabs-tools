/* ============================================================
   Cloud Status — live uptime of the optional cloud services
   ------------------------------------------------------------
   Source of truth: https://status.pixelabs.in/ (Better Stack).
   Reads the public status-page JSON and renders a branded page.
   It first asks our worker (/api/uptime, same-origin), and if that
   comes back empty or unreachable it fetches the public JSON
   directly. Auto-refreshes every 60 s.
   ============================================================ */
(function () {
  "use strict";

  var REFRESH_MS = 60000;
  var DIRECT_JSON = "https://status.pixelabs.in/index.json?include=resources";

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

  /* ---- data: accept either our worker's compact shape or the raw
          Better Stack JSON:API, and normalise to { state, sections }. ---- */
  function fromJsonApi(j) {
    var attrs = (j && j.data && j.data.attributes) || {};
    var inc = (j && j.included) || [];
    var sections = inc
      .filter(function (x) { return x.type === "status_page_section"; })
      .map(function (x) {
        return { id: String(x.id), name: (x.attributes && x.attributes.name) || "Services",
                 position: (x.attributes && x.attributes.position) || 0 };
      })
      .sort(function (a, b) { return a.position - b.position; });

    var seen = {};
    var resources = inc
      .filter(function (x) { return x.type === "status_page_resource" && !seen[x.id] && (seen[x.id] = 1); })
      .map(function (x) {
        var a = x.attributes || {};
        return {
          sectionId: String(a.status_page_section_id),
          name: a.public_name || "Service",
          note: a.explanation || "",
          status: a.status || "not_monitored",
          availability: typeof a.availability === "number"
            ? Math.round(a.availability * 100000) / 1000 : null,
          position: a.position || 0,
          history: (a.status_history || []).map(function (h) { return { day: h.day, status: h.status }; })
        };
      })
      .sort(function (a, b) { return a.position - b.position; });

    var groups = sections
      .map(function (s) { return { name: s.name, services: resources.filter(function (r) { return r.sectionId === s.id; }) }; })
      .filter(function (g) { return g.services.length; });
    var known = {};
    sections.forEach(function (s) { known[s.id] = 1; });
    var orphans = resources.filter(function (r) { return !known[r.sectionId]; });
    if (orphans.length) groups.push({ name: "Other services", services: orphans });

    return {
      provider: "Better Stack",
      page: "https://status.pixelabs.in/",
      company: attrs.company_name || "Service Status",
      state: attrs.aggregate_state || "unknown",
      updated: attrs.updated_at || null,
      announcement: attrs.announcement || null,
      sections: groups
    };
  }
  function normalise(p) {
    if (p && Array.isArray(p.sections)) return p;
    return fromJsonApi(p);
  }
  function hasSections(p) {
    return p && Array.isArray(p.sections) && p.sections.length > 0;
  }
  function hasResources(p) {
    return p && Array.isArray(p.included) &&
      p.included.some(function (x) { return x.type === "status_page_resource"; });
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store", headers: { "Accept": "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function loadData() {
    return fetchJson("/api/uptime")
      .then(function (p) {
        if (hasSections(p) || hasResources(p)) return normalise(p);
        return fetchJson(DIRECT_JSON).then(normalise);
      })
      .catch(function () {
        return fetchJson(DIRECT_JSON).then(normalise);
      });
  }

  /* ---- rendering ---- */
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
      "</div>" + bars(sv.history) +
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
      hero("off", "No cloud services tracked yet", "The status feed returned no services.");
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
    loadData()
      .then(function (j) { lastGood = j; failCount = 0; render(j); })
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
