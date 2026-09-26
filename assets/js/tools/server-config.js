/* Redirect & Config Generator — Nginx / .htaccess, fully local */
"use strict";

(function () {

  var els = {
    domain: document.getElementById("domain"),
    server: document.getElementById("server"),
    www: document.getElementById("www"),
    redirects: document.getElementById("redirects"),
    add: document.getElementById("add-btn"),
    optHttps: document.getElementById("opt-https"),
    optGzip: document.getElementById("opt-gzip"),
    optCache: document.getElementById("opt-cache"),
    optHeaders: document.getElementById("opt-headers"),
    gen: document.getElementById("gen-btn"),
    outPanel: document.getElementById("out-panel"),
    outTitle: document.getElementById("out-title"),
    out: document.getElementById("out"),
    copy: document.getElementById("copy-btn"),
    dl: document.getElementById("dl-btn")
  };

  function addRow(from, to) {
    var row = document.createElement("div");
    row.className = "options-grid";
    row.innerHTML =
      '<div class="option"><label class="field">From path</label>' +
      '<input type="text" class="r-from" placeholder="/old-page" spellcheck="false"></div>' +
      '<div class="option"><label class="field">To (full URL or path)</label>' +
      '<input type="text" class="r-to" placeholder="https://example.com/new-page" spellcheck="false"></div>';
    row.querySelector(".r-from").value = from || "";
    row.querySelector(".r-to").value = to || "";
    els.redirects.appendChild(row);
  }

  els.add.addEventListener("click", function () { addRow(); });

  addRow("/old-page", "");
  addRow();

  function domain() {
    var d = els.domain.value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return d || "example.com";
  }

  function rows() {
    var out = [];
    Array.prototype.forEach.call(els.redirects.querySelectorAll(".options-grid"), function (row) {
      var f = row.querySelector(".r-from").value.trim();
      var t = row.querySelector(".r-to").value.trim();
      if (f && t) out.push({ from: f, to: t });
    });
    return out;
  }

  function genNginx() {
    var d = domain();
    var L = [];
    var reds = rows();

    if (els.www.value === "none" || els.www.value === "www" || els.optHttps.checked) {
      L.push("server {");
      L.push("    listen 80;");
      L.push("    listen 443 ssl;");
      var host = els.www.value === "www" ? "www." + d : d;
      var target = els.www.value === "www" ? "https://www." + d : "https://" + d;
      L.push('    server_name ' + (els.www.value === "www" ? d : "www." + d) + ";");
      if (els.www.value === "www") L.push('    server_name ' + host + ";");
      L.push("    return 301 " + target + "$request_uri;");
      L.push("}");
      L.push("");
    }

    L.push("server {");
    L.push("    listen 443 ssl;");
    L.push("    listen [::]:443 ssl;");
    L.push("    server_name " + (els.www.value === "www" ? "www." + d : d) + ";");
    L.push("");
    L.push("    root /var/www/html;");
    L.push("    index index.html index.htm;");
    L.push("");

    if (els.optHeaders.checked) {
      L.push("    # Security headers");
      L.push('    add_header X-Frame-Options "DENY" always;');
      L.push('    add_header X-Content-Type-Options "nosniff" always;');
      L.push('    add_header Referrer-Policy "strict-origin-when-cross-origin" always;');
      L.push("");
    }

    if (reds.length) {
      L.push("    # 301 redirects");
      reds.forEach(function (r) {
        var to = r.to.indexOf("http") === 0 ? r.to : "https://" + (els.www.value === "www" ? "www." + d : d) + (r.to.charAt(0) === "/" ? r.to : "/" + r.to);
        L.push("    location = " + (r.from.charAt(0) === "/" ? r.from : "/" + r.from) + " {");
        L.push("        return 301 " + to + ";");
        L.push("    }");
      });
      L.push("");
    }

    if (els.optCache.checked) {
      L.push("    # Static file caching (30 days)");
      L.push("    location ~* \\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|woff2?)$ {");
      L.push("        expires 30d;");
      L.push("        add_header Cache-Control \"public, max-age=2592000\";");
      L.push("        try_files $uri =404;");
      L.push("    }");
      L.push("");
    }

    if (els.optGzip.checked) {
      L.push("    # Gzip compression");
      L.push("    gzip on;");
      L.push("    gzip_comp_level 5;");
      L.push("    gzip_min_length 256;");
      L.push("    gzip_proxied any;");
      L.push("    gzip_types text/plain text/css application/json application/javascript application/xml image/svg+xml;");
      L.push("");
    }

    L.push("    location / {");
    L.push("        try_files $uri $uri/ =404;");
    L.push("    }");
    L.push("}");
    return L.join("\n");
  }

  function genApache() {
    var d = domain();
    var L = ["RewriteEngine On"];
    if (els.optHttps.checked) {
      L.push("");
      L.push("# Force HTTPS");
      L.push("RewriteCond %{HTTPS} off");
      L.push("RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]");
    }
    if (els.www.value === "none") {
      L.push("");
      L.push("# www -> non-www");
      L.push("RewriteCond %{HTTP_HOST} ^www\\." + d.replace(/\./g, "\\.") + " [NC]");
      L.push("RewriteRule ^(.*)$ https://" + d + "/$1 [L,R=301]");
    } else if (els.www.value === "www") {
      L.push("");
      L.push("# non-www -> www");
      L.push("RewriteCond %{HTTP_HOST} ^" + d.replace(/\./g, "\\.") + " [NC]");
      L.push("RewriteRule ^(.*)$ https://www." + d + "/$1 [L,R=301]");
    }
    var reds = rows();
    if (reds.length) {
      L.push("");
      L.push("# 301 redirects");
      reds.forEach(function (r) {
        var to = r.to.indexOf("http") === 0 ? r.to : "https://" + (els.www.value === "www" ? "www." + d : d) + (r.to.charAt(0) === "/" ? r.to : "/" + r.to);
        L.push("Redirect 301 " + (r.from.charAt(0) === "/" ? r.from : "/" + r.from) + " " + to);
      });
    }
    if (els.optCache.checked) {
      L.push("");
      L.push("# Static file caching (30 days)");
      L.push("<IfModule mod_expires.c>");
      L.push("    ExpiresActive On");
      L.push("    ExpiresByType image/jpeg \"access plus 30 days\"");
      L.push("    ExpiresByType image/png \"access plus 30 days\"");
      L.push("    ExpiresByType image/webp \"access plus 30 days\"");
      L.push("    ExpiresByType text/css \"access plus 30 days\"");
      L.push("    ExpiresByType application/javascript \"access plus 30 days\"");
      L.push("    ExpiresByType font/woff2 \"access plus 30 days\"");
      L.push("</IfModule>");
    }
    if (els.optGzip.checked) {
      L.push("");
      L.push("# Gzip compression");
      L.push("<IfModule mod_deflate.c>");
      L.push("    AddOutputFilterByType DEFLATE text/html text/plain text/css application/json application/javascript application/xml image/svg+xml");
      L.push("</IfModule>");
    }
    if (els.optHeaders.checked) {
      L.push("");
      L.push("# Security headers");
      L.push("<IfModule mod_headers.c>");
      L.push('    Header always set X-Frame-Options "DENY"');
      L.push('    Header always set X-Content-Type-Options "nosniff"');
      L.push('    Header always set Referrer-Policy "strict-origin-when-cross-origin"');
      L.push("</IfModule>");
    }
    return L.join("\n");
  }

  els.gen.addEventListener("click", function () {
    var code = els.server.value === "nginx" ? genNginx() : genApache();
    els.outTitle.textContent = els.server.value === "nginx" ? "nginx.conf" : ".htaccess";
    els.out.value = code;
    els.outPanel.classList.remove("hidden");
    els.outPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.copy.addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(els.out.value).then(function () { toast("Config copied!", "ok"); });
    }
  });

  els.dl.addEventListener("click", function () {
    if (els.out.value) {
      var name = els.server.value === "nginx" ? "nginx-site.conf" : "htaccess.txt";
      downloadBlob(new Blob([els.out.value], { type: "text/plain" }), name);
    }
  });

})();
