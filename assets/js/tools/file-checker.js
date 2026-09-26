/* File Type Checker — magic bytes, fully local */
"use strict";

(function () {

  var els = {
    dropzone: document.getElementById("dropzone"),
    result: document.getElementById("result-panel"),
    verdict: document.getElementById("verdict"),
    hex: document.getElementById("hex")
  };

  /* [name, extension, mime, bytes (hex, lowercase), offset] */
  var SIGS = [
    ["JPEG image", "jpg", "image/jpeg", "ffd8ff", 0],
    ["PNG image", "png", "image/png", "89504e470d0a1a0a", 0],
    ["GIF image", "gif", "image/gif", "47494638", 0],
    ["WebP image", "webp", "image/webp", "52494646", 0, "webp"],
    ["BMP image", "bmp", "image/bmp", "424d", 0],
    ["PDF document", "pdf", "application/pdf", "25504446", 0],
    ["ZIP archive (also docx / xlsx / apk / jar / epub)", "zip", "application/zip", "504b0304", 0],
    ["RAR archive", "rar", "application/vnd.rar", "526172211a0700", 0],
    ["7-Zip archive", "7z", "application/x-7z-compressed", "377abcaf271c", 0],
    ["GZip archive (often .gz, sometimes a renamed .tar.gz)", "gz", "application/gzip", "1f8b", 0],
    ["MP3 audio", "mp3", "audio/mpeg", "494433", 0],
    ["MP3 audio (raw frame)", "mp3", "audio/mpeg", "fffb", 0],
    ["MP4 / M4V video", "mp4", "video/mp4", "66747970", 4],
    ["QuickTime video (MOV)", "mov", "video/quicktime", "6d6f6f76", 4],
    ["WebM / MKV video", "webm", "video/webm", "1a45dfa3", 0],
    ["AVI video", "avi", "video/x-msvideo", "52494646", 0, "avi"],
    ["WAV audio", "wav", "audio/wav", "52494646", 0, "wav"],
    ["OGG audio / video", "ogg", "audio/ogg", "4f676753", 0],
    ["FLAC audio", "flac", "audio/flac", "664c6143", 0],
    ["MIDI audio", "mid", "audio/midi", "4d546864", 0],
    ["Windows / MS-DOS executable", "exe", "application/vnd.microsoft.portable-executable", "4d5a", 0],
    ["Linux ELF executable", "elf", "application/x-elf", "7f454c46", 0],
    ["Android APK (zip)", "apk", "application/vnd.android.package-archive", "504b0304", 0],
    ["SQLite database", "sqlite", "application/x-sqlite3", "53514c69746520666f726d61742033", 0],
    ["EPUB e-book (zip)", "epub", "application/epub+zip", "504b0304", 0],
    ["TAR archive", "tar", "application/x-tar", "7573746172", 257],
    ["ISO disc image", "iso", "application/x-iso9660-image", "4344303031", 32769],
    ["ICO icon", "ico", "image/x-icon", "00000100", 0],
    ["Photoshop document", "psd", "image/vnd.adobe.photoshop", "38425053", 0],
    ["TIFF image", "tiff", "image/tiff", "49492a00", 0],
    ["HEIC/HEIF photo (Apple)", "heic", "image/heic", "0000001866747970686569", 0]
  ];

  makeDropzone({ el: els.dropzone, onFiles: function (files) { check(files[0]); } });

  function toHex(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? "0" : "") + u8[i].toString(16);
    return s;
  }

  function check(file) {
    if (!file) return;
    file.slice(0, 32800).arrayBuffer().then(function (ab) {
      var u8 = new Uint8Array(ab);
      var head = u8.subarray(0, 64);
      var headHex = toHex(head);
      var longHex = toHex(u8.subarray(0, Math.min(400, u8.length)));

      var match = null;
      for (var i = 0; i < SIGS.length; i++) {
        var s = SIGS[i];
        var off = s[4] || 0;
        if (longHex.length >= (off + 1) * 2 && longHex.substr(off * 2, s[3].length) === s[3]) {
          /* RIFF-family disambiguation */
          if (s[5]) {
            if (longHex.indexOf(toHex(strToU8(s[5]))) === -1) continue;
          }
          match = s;
          break;
        }
      }

      /* text heuristics */
      var isText = true;
      for (var t = 0; t < head.length; t++) {
        var c = head[t];
        if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) continue;
        isText = false;
        break;
      }
      if (!match && isText && head.length) {
        match = ["plain text (UTF-8/ASCII)", "txt", "text/plain", "", 0];
      }
      if (!match) match = ["Unknown / unrecognised format", "", "application/octet-stream", "", 0];

      var ext = (file.name.split(".").pop() || "").toLowerCase();
      var extOk = !ext || !match[1] || ext === match[1] ||
        (match[1] === "zip" && ["docx", "xlsx", "pptx", "apk", "jar", "epub", "zip", "ipa"].indexOf(ext) > -1) ||
        (match[1] === "gz" && ["gz", "tgz"].indexOf(ext) > -1) ||
        (match[1] === "mp4" && ["mp4", "m4a", "m4v"].indexOf(ext) > -1);

      var html = "";
      html += '<p style="margin:0 0 10px"><b>' + escapeHtml(file.name) + '</b> · ' + formatBytes(file.size) + '</p>';
      html += '<p style="margin:0 0 6px; font-size:1.15rem">Real format: <b style="color:var(--accent)">' + escapeHtml(match[0]) + '</b></p>';
      if (match[1]) html += '<p style="margin:0">Suggested extension: <b>.' + match[1] + '</b>' + (match[2] ? ' · <span style="color:var(--text-2); font-size:.85rem">' + match[2] + "</span>" : "") + "</p>";
      if (ext && !extOk) {
        html += '<div class="msg err" style="display:block; margin-top:12px">Mismatch! The file extension <b>.' + escapeHtml(ext) + "</b> does not match its real content (<b>." + match[1] + "</b>). Rename it to <b>" + escapeHtml(baseName(file.name)) + "." + match[1] + "</b> and it should open correctly.</div>";
      } else if (ext) {
        html += '<div class="msg ok" style="display:block; margin-top:12px">The extension <b>.' + escapeHtml(ext) + "</b> matches the real content.</div>";
      }
      els.verdict.innerHTML = html;

      /* pretty hex dump of the first 64 bytes */
      var lines = [];
      for (var h = 0; h < head.length; h += 16) {
        var chunk = head.subarray(h, h + 16);
        var hexs = "";
        for (var k = 0; k < chunk.length; k++) hexs += (chunk[k] < 16 ? "0" : "") + chunk[k].toString(16) + " ";
        lines.push(hexs.trim());
      }
      els.hex.value = lines.join("\n");

      els.result.classList.remove("hidden");
      els.result.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function strToU8(s) {
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

})();
