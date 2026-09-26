/* Cron Helper — parser, plain-English explainer, next-run calculator */
"use strict";

(function () {

  var els = {
    cron: document.getElementById("cron"),
    presets: document.getElementById("presets"),
    explainPanel: document.getElementById("explain-panel"),
    explain: document.getElementById("explain"),
    next: document.getElementById("next-runs"),
    msg: document.getElementById("msg")
  };

  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  /* ---------- field parsing ---------- */
  function parseField(field, min, max) {
    if (field === "*") return { every: true, set: null, step: 1 };
    var parts = field.split(",");
    var set = {};
    var star = false;
    var step = 1;
    parts.forEach(function (part) {
      var s = part;
      var slash = s.indexOf("/");
      if (slash > -1) {
        var st = parseInt(s.slice(slash + 1), 10);
        if (st > 0) step = st;
        s = s.slice(0, slash);
      }
      var a, b;
      if (s === "*") {
        a = min; b = max; star = true;
      } else if (s.indexOf("-") > -1) {
        var r = s.split("-");
        a = parseInt(r[0], 10);
        b = parseInt(r[1], 10);
      } else {
        a = b = parseInt(s, 10);
        if (isNaN(a)) throw new Error("bad value '" + s + "'");
      }
      if (isNaN(a) || isNaN(b) || a < min || b > max || a > b) throw new Error("value out of range in '" + part + "'");
      for (var v = a; v <= b; v++) set[v] = true;
    });
    return { every: false, set: set, step: step, star: star };
  }

  function parseCron(str) {
    var f = str.trim().split(/\s+/);
    if (f.length !== 5) throw new Error("a cron expression must have exactly 5 fields");
    var minute = parseField(f[0], 0, 59);
    var hour = parseField(f[1], 0, 23);
    var dom = parseField(f[2], 1, 31);
    var month = parseField(f[3], 1, 12);
    var dow = parseField(f[4], 0, 7);
    if (dow.set && dow.set[7]) { dow.set[0] = true; delete dow.set[7]; } /* 7 = Sunday */
    return { minute: minute, hour: hour, dom: dom, month: month, dow: dow };
  }

  function describeField(field, unitName, singular, formatter) {
    if (field.every && field.step === 1) return "";
    if (field.every && field.step > 1) return "every " + field.step + " " + unitName + "s";
    var keys = Object.keys(field.set).map(Number).sort(function (a, b) { return a - b; });
    var pretty = keys.map(function (k) { return formatter ? formatter(k) : String(k); });
    if (field.step > 1) return pretty.join(", ") + " (every " + field.step + ")";
    return pretty.join(", ");
  }

  function matches(cron, d) {
    if (cron.minute.set && !cron.minute.set[d.getMinutes()]) return false;
    if (cron.hour.set && !cron.hour.set[d.getHours()]) return false;
    if (cron.month.set && !cron.month.set[d.getMonth() + 1]) return false;
    var domAll = !cron.dom.set;
    var dowAll = !cron.dow.set;
    var domOk = domAll || !!cron.dom.set[d.getDate()];
    var dowOk = dowAll || !!cron.dow.set[d.getDay()];
    /* classic cron quirk: if both dom and dow are restricted, match either */
    if (!domAll && !dowAll) { if (!(domOk || dowOk)) return false; }
    else { if (!domOk || !dowOk) return false; }
    return true;
  }

  function nextRuns(cron, count) {
    var runs = [];
    var d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    var limit = 60 * 24 * 370; /* up to ~1 year of minutes */
    while (runs.length < count && limit-- > 0) {
      if (matches(cron, d)) runs.push(new Date(d));
      d.setMinutes(d.getMinutes() + 1);
    }
    return runs;
  }

  /* ---------- explanation ---------- */
  function explain(cron) {
    var parts = [];

    var minDesc = describeField(cron.minute, "minute", "minute");
    var hourDesc = describeField(cron.hour, "hour", "hour");
    var hourKeys = cron.hour.set ? Object.keys(cron.hour.set).map(Number).sort(function (a, b) { return a - b; }) : null;

    /* time phrase */
    if (cron.minute.every && cron.minute.step === 1 && cron.hour.every && cron.hour.step === 1) {
      parts.push("Every minute");
    } else if (cron.minute.every && cron.minute.step > 1 && cron.hour.every) {
      parts.push("Every " + cron.minute.step + " minutes");
    } else if (!cron.minute.set && !cron.hour.set) {
      parts.push("Every " + cron.minute.step + " minutes");
    } else {
      /* specific time(s) */
      var timePhrase;
      if (hourKeys && hourKeys.length === 1 && minDesc && minDesc.indexOf("every") === -1 && !minDesc.includes(",")) {
        var hh = hourKeys[0];
        var ampm = hh < 12 ? "AM" : "PM";
        var h12 = hh % 12 === 0 ? 12 : hh % 12;
        var mm = minDesc ? String(Object.keys(cron.minute.set).map(Number).sort(function (a, b) { return a - b; })[0] || 0) : "00";
        var mmNice = (Object.keys(cron.minute.set).length === 1) ? (":" + (Object.keys(cron.minute.set)[0].length === 1 ? "0" : "") + Object.keys(cron.minute.set)[0]) : "";
        if (mmNice === "" && minDesc) mmNice = " at minute " + minDesc;
        if (cron.minute.every && cron.minute.step > 1) mmNice = " (minute 0 of every " + cron.minute.step + " minutes)";
        timePhrase = "at " + h12 + mmNice + " " + ampm;
        if (!cron.minute.set) timePhrase = "at the top of the hour (minute 0) every " + cron.minute.step + " minutes";
      } else {
        timePhrase = "hour" + (hourDesc ? " " + hourDesc : "") + (minDesc ? ", at minute " + minDesc : ", every minute");
      }
      parts.push(timePhrase.charAt(0).toUpperCase() + timePhrase.slice(1));
    }

    /* day-of-week phrase */
    if (!cron.dow.every && cron.dow.set) {
      var days = Object.keys(cron.dow.set).map(Number).sort(function (a, b) { return a - b; });
      if (days.length === 5 && days[0] === 1 && days[4] === 5) parts.push("on weekdays (Mon–Fri)");
      else if (days.length === 2 && days[0] === 0 && days[1] === 6) parts.push("on weekends");
      else parts.push("on " + days.map(function (d) { return DAY_NAMES[d]; }).join(", "));
    }

    /* day-of-month phrase */
    if (!cron.dom.every && cron.dom.set) {
      parts.push("on day " + Object.keys(cron.dom.set).sort(function (a, b) { return a - b; }).join(", ") + " of the month");
    }

    /* month phrase */
    if (!cron.month.every && cron.month.set) {
      parts.push("in " + Object.keys(cron.month.set).map(Number).sort(function (a, b) { return a - b; }).map(function (m) { return MONTH_NAMES[m - 1]; }).join(", "));
    }

    var text = parts.join(", ").replace(/, on weekdays \(Mon–Fri\)$/, " on weekdays (Mon–Fri)");
    if (text.indexOf("Every minute") === 0) text = "Every minute, every day";
    else text += "";
    return text + (text.indexOf("every day") === -1 && !cron.dom.set && cron.dow.every ? " (every day)" : "");
  }

  function fmtDate(d) {
    return d.toLocaleString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function run() {
    try {
      var cron = parseCron(els.cron.value);
      els.msg.className = "msg";
      els.explain.textContent = "“" + els.cron.value.trim() + "” means: " + explain(cron) + ".";
      var runs = nextRuns(cron, 5);
      els.next.innerHTML = "";
      if (runs.length) {
        runs.forEach(function (r) {
          var row = document.createElement("div");
          row.className = "file-row";
          row.innerHTML = '<div class="meta"><div class="name" style="font-family:var(--mono)"></div></div>';
          row.querySelector(".name").textContent = fmtDate(r);
          els.next.appendChild(row);
        });
      } else {
        els.next.innerHTML = '<p class="muted">This expression may never run (e.g. February 30).</p>';
      }
      els.explainPanel.classList.remove("hidden");
      els.explainPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      els.msg.textContent = "Invalid cron: " + e.message;
      els.msg.className = "msg err";
    }
  }

  els.cron.addEventListener("input", run);
  els.presets.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-cron]");
    if (!btn) return;
    els.cron.value = btn.getAttribute("data-cron");
    run();
  });

  run();

})();
