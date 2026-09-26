/* cURL Converter — shell tokenizer + code generators, fully local */
"use strict";

(function () {

  var els = {
    input: document.getElementById("in"),
    lang: document.getElementById("lang"),
    conv: document.getElementById("conv-btn"),
    outPanel: document.getElementById("out-panel"),
    out: document.getElementById("out"),
    copy: document.getElementById("copy-btn"),
    msg: document.getElementById("msg")
  };

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = "msg " + (kind || "info");
  }

  /* ---- shell-like tokenizer ---- */
  function tokenize(cmd) {
    /* join line continuations */
    cmd = cmd.replace(/\\\r?\n/g, " ").replace(/\r?\n/g, " ").trim();
    /* drop leading "curl" */
    cmd = cmd.replace(/^\s*curl\s+/i, "");

    var tokens = [];
    var i = 0;
    while (i < cmd.length) {
      var c = cmd[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "'" || c === '"') {
        var j = i + 1;
        var val = "";
        while (j < cmd.length && cmd[j] !== c) {
          if (c === '"' && cmd[j] === "\\") { val += cmd[j + 1] || ""; j += 2; continue; }
          val += cmd[j];
          j++;
        }
        tokens.push(val);
        i = j + 1;
        continue;
      }
      if (c === "$" && cmd[i + 1] === "'") {
        /* ANSI-C quoting: keep the inner text literally */
        var j2 = i + 2;
        var v2 = "";
        while (j2 < cmd.length && cmd[j2] !== "'") { v2 += cmd[j2]; j2++; }
        tokens.push(v2);
        i = j2 + 1;
        continue;
      }
      var j3 = i;
      while (j3 < cmd.length && !/\s/.test(cmd[j3])) j3++;
      tokens.push(cmd.slice(i, j3));
      i = j3;
    }
    return tokens;
  }

  function parse(tokens) {
    var req = { method: null, url: "", headers: [], data: null, json: false, user: null, head: false, insecure: false, compressed: false, cookies: null, form: [] };
    var i = 0;
    while (i < tokens.length) {
      var t = tokens[i];
      if (t === "-X" || t === "--request") { req.method = tokens[++i]; i++; continue; }
      if (t.indexOf("-X") === 0 && t.length > 2) { req.method = t.slice(2); i++; continue; }
      if (t === "-H" || t === "--header") { req.headers.push(tokens[++i]); i++; continue; }
      if (t.indexOf("--header=") === 0) { req.headers.push(t.slice(9)); i++; continue; }
      if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-ascii" || t === "--data-binary") {
        req.data = tokens[++i]; i++; continue;
      }
      if (t.indexOf("--data-raw=") === 0) { req.data = t.slice(11); i++; continue; }
      if (t.indexOf("--data=") === 0) { req.data = t.slice(7); i++; continue; }
      if (t === "--json") { req.json = true; i++; continue; }
      if (t === "-u" || t === "--user") { req.user = tokens[++i]; i++; continue; }
      if (t === "-b" || t === "--cookie") { req.cookies = tokens[++i]; i++; continue; }
      if (t === "-I" || t === "--head") { req.head = true; i++; continue; }
      if (t === "-k" || t === "--insecure") { req.insecure = true; i++; continue; }
      if (t === "--compressed") { req.compressed = true; i++; continue; }
      if (t === "-L" || t === "--location") { i++; continue; }
      if (t === "-F" || t === "--form") { req.form.push(tokens[++i]); i++; continue; }
      if (t === "-A" || t === "--user-agent") { req.headers.push("User-Agent: " + tokens[++i]); i++; continue; }
      if (t === "-e" || t === "--referer") { req.headers.push("Referer: " + tokens[++i]); i++; continue; }
      if (t === "-o" || t === "--output" || t === "-s" || t === "--silent" || t === "-i" || t === "--include" || t === "-v" || t === "--verbose" || t === "--url") {
        if (t === "--url") { req.url = tokens[++i]; }
        else if (t === "-o" || t === "--output") { i++; }
        i++; continue;
      }
      if (t.indexOf("-H") === 0 && t.length > 2) { req.headers.push(t.slice(2)); i++; continue; }
      if (t.indexOf("--") === 0) { i++; continue; } /* unknown long flag: skip */
      if (t.indexOf("-") === 0 && t.length === 2) { i++; continue; } /* unknown short flag: skip */
      req.url = t;
      i++;
    }
    if (!req.method) req.method = req.data ? "POST" : (req.head ? "HEAD" : "GET");
    return req;
  }

  function parseHeaders(headers) {
    var h = {};
    headers.forEach(function (raw) {
      var idx = raw.indexOf(":");
      if (idx === -1) return;
      var k = raw.slice(0, idx).trim();
      var v = raw.slice(idx + 1).trim();
      if (k.toLowerCase() === "cookie") { h.Cookie = v; return; }
      /* camelCase header names */
      h[k.split("-").map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join("-")] = v;
    });
    return h;
  }

  function tryParseJson(s) {
    try { return JSON.parse(s); } catch (e) { return undefined; }
  }

  function jsVal(v, indent) {
    return JSON.stringify(v, null, 2).split("\n").join("\n" + indent);
  }

  /* ---- generators ---- */
  function genFetch(req) {
    var h = parseHeaders(req.headers);
    var lines = [];
    var opts = [];
    opts.push("  method: \"" + req.method + "\"");
    if (Object.keys(h).length) opts.push("  headers: " + jsVal(h, "  ").replace(/^/, ""));
    if (req.user) h["Authorization"] = "Basic " + btoa(req.user);
    if (req.data !== null) {
      var json = tryParseJson(req.data);
      if (req.json && json !== undefined) {
        opts.push("  body: JSON.stringify(" + jsVal(json, "  ") + ")");
      } else if (json !== undefined && !req.form.length) {
        if (h["Content-Type"] && h["Content-Type"].indexOf("json") > -1) {
          opts.push("  body: JSON.stringify(" + jsVal(json, "  ") + ")");
        } else {
          opts.push("  body: " + jsVal(req.data, "  "));
        }
      } else if (req.form.length) {
        opts.push("  body: new URLSearchParams(" + jsVal(formToObj(req.form), "  ") + ")");
      } else {
        opts.push("  body: " + jsVal(req.data, "  "));
      }
    }
    lines.push("fetch(" + JSON.stringify(req.url) + ", {");
    lines.push(opts.join(",\n").split("\n").map(function (l, i2) { return i2 === 0 ? l : l; }).join("\n"));
    lines.push("})");
    lines.push("  .then(function (res) { return res.json(); })");
    lines.push("  .then(function (data) { console.log(data); })");
    lines.push("  .catch(function (err) { console.error(err); })");
    return lines.join("\n");
  }

  function formToObj(form) {
    var o = {};
    form.forEach(function (kv) {
      var idx = kv.indexOf("=");
      if (idx > -1) o[kv.slice(0, idx)] = kv.slice(idx + 1);
    });
    return o;
  }

  function genAxios(req) {
    var h = parseHeaders(req.headers);
    var lines = ["axios({", "  url: " + JSON.stringify(req.url) + ",", "  method: \"" + req.method + "\""];
    if (Object.keys(h).length) lines.push("  headers: " + jsVal(h, "  "));
    if (req.data !== null) {
      var json = tryParseJson(req.data);
      if (json !== undefined && !req.form.length) lines.push("  data: " + jsVal(json, "  "));
      else if (req.form.length) lines.push("  data: " + jsVal(formToObj(req.form), "  "));
      else lines.push("  data: " + jsVal(req.data, "  "));
    }
    lines.push("}).then(function (res) { console.log(res.data); })");
    lines.push("  .catch(function (err) { console.error(err); })");
    return lines.join(",\n").replace(",\n.then", "\n.then");
  }

  function genPython(req) {
    var h = parseHeaders(req.headers);
    var lines = ["import requests", "", "url = " + JSON.stringify(req.url)];
    if (Object.keys(h).length) {
      lines.push("headers = " + pyDict(h));
    }
    var json = req.data !== null ? tryParseJson(req.data) : undefined;
    if (req.form.length) {
      lines.push("data = " + pyDict(formToObj(req.form)));
    } else if (json !== undefined) {
      lines.push("json_payload = " + pyDict(json));
    } else if (req.data !== null) {
      lines.push("data = " + JSON.stringify(req.data));
    }
    lines.push("");
    var args = ["url=url"];
    if (Object.keys(h).length) args.push("headers=headers");
    if (req.form.length) args.push("data=data");
    else if (json !== undefined) args.push("json=json_payload");
    else if (req.data !== null) args.push("data=data");
    if (req.insecure) args.push("verify=False");
    lines.push("response = requests." + req.method.toLowerCase() + "(" + args.join(", ") + ")");
    lines.push("print(response.status_code, response.text)");
    return lines.join("\n");
  }

  function pyVal(v) {
    if (v === null || v === true || v === false) return String(v);
    if (typeof v === "number") return String(v);
    if (typeof v === "object") return pyDict(v);
    return JSON.stringify(v);
  }

  function pyDict(obj) {
    var keys = Object.keys(obj);
    if (!keys.length) return "{}";
    var parts = keys.map(function (k) { return "    " + JSON.stringify(k) + ": " + pyVal(obj[k]) + ","; });
    return parts.join("\n").slice(0, -1).replace(/^/, "{\n") + "\n}";
  }

  els.conv.addEventListener("click", function () {
    var cmd = els.input.value.trim();
    if (!cmd) { showMsg("Paste a cURL command first.", "err"); return; }
    try {
      var req = parse(tokenize(cmd));
      if (!req.url) { showMsg("Could not find a URL in this command.", "err"); return; }
      var code = els.lang.value === "fetch" ? genFetch(req) : els.lang.value === "axios" ? genAxios(req) : genPython(req);
      els.out.value = code;
      els.outPanel.classList.remove("hidden");
      els.outPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      var notes = [];
      if (req.form.length) notes.push("form data converted to a simple object (file uploads are not carried over)");
      if (req.user) notes.push("basic auth converts to an Authorization header");
      showMsg(notes.length ? "Converted. Note: " + notes.join("; ") + "." : "Converted!", notes.length ? "info" : "ok");
    } catch (e) {
      showMsg("Could not parse this command: " + e.message, "err");
    }
  });

  els.copy.addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(els.out.value).then(function () { toast("Code copied!", "ok"); });
    }
  });

})();
