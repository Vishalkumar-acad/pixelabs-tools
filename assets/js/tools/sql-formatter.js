/* SQL Formatter — tokenizer + clause-based layout, fully local */
"use strict";

(function () {

  var els = {
    input: document.getElementById("in"),
    fmt: document.getElementById("fmt-btn"),
    min: document.getElementById("min-btn"),
    outPanel: document.getElementById("out-panel"),
    out: document.getElementById("out"),
    copy: document.getElementById("copy-btn"),
    dl: document.getElementById("dl-btn"),
    msg: document.getElementById("msg")
  };

  var MAJOR = ["SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET",
    "UNION ALL", "UNION", "EXCEPT", "INTERSECT", "VALUES", "RETURNING",
    "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL JOIN", "FULL OUTER JOIN", "LEFT OUTER JOIN", "RIGHT OUTER JOIN", "CROSS JOIN", "JOIN",
    "INSERT INTO", "UPDATE", "DELETE FROM", "CREATE TABLE", "ALTER TABLE", "DROP TABLE", "DROP INDEX", "CREATE INDEX"];

  var KEYWORDS = ["SELECT", "DISTINCT", "AS", "FROM", "WHERE", "AND", "OR", "NOT", "NULL", "IS", "IN", "LIKE", "ILIKE",
    "BETWEEN", "EXISTS", "CASE", "WHEN", "THEN", "ELSE", "END", "JOIN", "ON", "USING", "INNER", "OUTER", "LEFT", "RIGHT",
    "FULL", "CROSS", "GROUP", "BY", "HAVING", "ORDER", "ASC", "DESC", "LIMIT", "OFFSET", "UNION", "ALL", "EXCEPT",
    "INTERSECT", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "ALTER", "DROP", "TABLE", "INDEX",
    "VIEW", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE", "DEFAULT", "CHECK", "CONSTRAINT", "IF",
    "SUM", "COUNT", "AVG", "MIN", "MAX", "COALESCE", "NULLIF", "CAST", "DISTINCT", "WITH", "RECURSIVE", "RETURNING", "CASCADE"];

  function tokenize(sql) {
    var tokens = [];
    var i = 0;
    while (i < sql.length) {
      var c = sql[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "-" && sql[i + 1] === "-") {
        var j = sql.indexOf("\n", i);
        if (j === -1) j = sql.length;
        tokens.push({ t: "comment", v: sql.slice(i, j) });
        i = j;
        continue;
      }
      if (c === "/" && sql[i + 1] === "*") {
        var j2 = sql.indexOf("*/", i);
        if (j2 === -1) j2 = sql.length;
        tokens.push({ t: "comment", v: sql.slice(i, j2 + 2) });
        i = j2 + 2;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        var j3 = i + 1;
        while (j3 < sql.length && sql[j3] !== c) j3 += (sql[j3] === "\\") ? 2 : 1;
        tokens.push({ t: c === "'" ? "string" : "quoted", v: sql.slice(i, Math.min(j3 + 1, sql.length)) });
        i = j3 + 1;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var j4 = i;
        while (j4 < sql.length && /[A-Za-z0-9_.$]/.test(sql[j4])) j4++;
        tokens.push({ t: "word", v: sql.slice(i, j4) });
        i = j4;
        continue;
      }
      if (/[0-9]/.test(c)) {
        var j5 = i;
        while (j5 < sql.length && /[0-9.]/.test(sql[j5])) j5++;
        tokens.push({ t: "number", v: sql.slice(i, j5) });
        i = j5;
        continue;
      }
      tokens.push({ t: "op", v: c });
      i++;
    }
    return tokens;
  }

  function mergeWords(tokens) {
    /* merge two-word clauses like "GROUP BY", "LEFT JOIN" */
    var out = [];
    var i = 0;
    while (i < tokens.length) {
      var tok = tokens[i];
      if (tok.t === "word") {
        var two = tok.v.toUpperCase() + " " + (tokens[i + 1] && tokens[i + 1].t === "word" ? tokens[i + 1].v.toUpperCase() : "");
        var three = two + " " + (tokens[i + 2] && tokens[i + 2].t === "word" ? tokens[i + 2].v.toUpperCase() : "");
        var found = null, take = 0;
        for (var m = 0; m < MAJOR.length; m++) {
          var parts = MAJOR[m].split(" ");
          var joined = parts.join(" ");
          if (parts.length === 3 && three === joined) { found = MAJOR[m]; take = 3; break; }
          if (parts.length === 2 && two === joined && (!found || take < 2)) { found = MAJOR[m]; take = 2; }
          if (parts.length === 1 && tok.v.toUpperCase() === joined) { found = MAJOR[m]; take = 1; break; }
        }
        if (found) {
          out.push({ t: "clause", v: found });
          i += take;
          continue;
        }
      }
      out.push(tok);
      i++;
    }
    return out;
  }

  function format(sql) {
    var tokens = mergeWords(tokenize(sql));
    var out = "";
    var depth = 0;
    var i;

    function up(tok) {
      var v = tok.v;
      if (tok.t === "word") {
        var upv = v.toUpperCase();
        return KEYWORDS.indexOf(upv) > -1 ? upv : v;
      }
      return v;
    }

    for (i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (tok.t === "comment") { out += tok.v; continue; }
      if (tok.t === "clause") {
        out = out.replace(/\s+$/, "");
        if (out && out.slice(-1) !== "\n") out += "\n";
        out += tok.v + " ";
        continue;
      }
      if (tok.v === "(") { depth++; out += " ("; continue; }
      if (tok.v === ")") { depth = Math.max(0, depth - 1); out = out.replace(/\s+$/, "") + ") "; continue; }
      if (tok.v === ",") {
        out = out.replace(/\s+$/, "");
        out += ",\n" + new Array(depth + 2).join("  ");
        continue;
      }
      if (tok.v === ";") {
        out = out.replace(/\s+$/, "") + ";\n";
        continue;
      }
      out += up(tok) + " ";
    }
    return out.replace(/\n{3,}/g, "\n\n").split("\n").map(function (l) { return l.replace(/\s+$/, ""); }).join("\n").trim() + "\n";
  }

  function minify(sql) {
    return mergeWords(tokenize(sql)).map(function (t) {
      if (t.t === "clause") return t.v;
      if (t.t === "word") {
        var upv = t.v.toUpperCase();
        return KEYWORDS.indexOf(upv) > -1 ? upv : t.v;
      }
      return t.v;
    }).join(" ").replace(/\s+/g, " ").trim();
  }

  els.fmt.addEventListener("click", function () {
    if (!els.input.value.trim()) { toast("Paste some SQL first.", "err"); return; }
    els.out.value = format(els.input.value);
    els.outPanel.classList.remove("hidden");
    els.outPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.min.addEventListener("click", function () {
    if (!els.input.value.trim()) { toast("Paste some SQL first.", "err"); return; }
    els.out.value = minify(els.input.value);
    els.outPanel.classList.remove("hidden");
    els.outPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.copy.addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(els.out.value).then(function () { toast("SQL copied!", "ok"); });
    }
  });

  els.dl.addEventListener("click", function () {
    if (els.out.value) downloadBlob(new Blob([els.out.value], { type: "text/plain" }), "query.sql");
  });

})();
