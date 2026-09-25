/* Images to PDF — build a PDF from images, using pdf-lib locally */
"use strict";

(function () {

  if (typeof PDFLib === "undefined") { missingLib("pdf-lib"); return; }
  var { PDFDocument } = PDFLib;

  /* Page sizes in points (1/72 inch) */
  var PAGE_SIZES = {
    a4: [595.28, 841.89],
    a4l: [841.89, 595.28],
    letter: [612, 792]
  };

  var files = [];
  var uid = 0;

  var els = {
    dropzone: document.getElementById("dropzone"),
    fileList: document.getElementById("file-list"),
    emptyHint: document.getElementById("empty-hint"),
    pageSize: document.getElementById("page-size"),
    margin: document.getElementById("margin"),
    createBtn: document.getElementById("create-btn"),
    clearBtn: document.getElementById("clear-btn"),
    msg: document.getElementById("msg")
  };

  makeDropzone({
    el: els.dropzone,
    accept: "image/",
    multiple: true,
    onFiles: function (list) {
      list.forEach(function (f) {
        if (/^image\/(jpeg|png|webp)$/.test(f.type)) files.push({ file: f, id: ++uid });
        else toast("Skipped " + f.name + " — only JPG, PNG and WEBP are supported.", "err");
      });
      render();
    }
  });

  els.clearBtn.addEventListener("click", function () {
    files = [];
    render();
    els.msg.className = "msg";
  });

  function render() {
    els.createBtn.disabled = files.length < 1;
    els.clearBtn.disabled = !files.length;
    els.fileList.innerHTML = "";
    if (!files.length) {
      els.fileList.appendChild(els.emptyHint.cloneNode(true));
      return;
    }
    files.forEach(function (item, i) {
      var row = document.createElement("div");
      row.className = "file-row";
      var thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = URL.createObjectURL(item.file);
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = "<div class='name'>" + (i + 1) + ". " + escapeHtml(item.file.name) + "</div>" +
        "<div class='size'>" + formatBytes(item.file.size) + " — page " + (i + 1) + "</div>";
      var controls = document.createElement("div");
      controls.className = "controls";
      [["↑", "Move up", function () { move(i, -1); }],
       ["↓", "Move down", function () { move(i, 1); }],
       ["✕", "Remove", function () { files = files.filter(function (x) { return x.id !== item.id; }); render(); }]]
        .forEach(function (b) {
          var btn = document.createElement("button");
          btn.title = b[1];
          btn.textContent = b[0];
          btn.addEventListener("click", b[2]);
          controls.appendChild(btn);
        });
      row.append(thumb, meta, controls);
      els.fileList.appendChild(row);
    });
  }

  function move(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= files.length) return;
    var tmp = files[i];
    files[i] = files[j];
    files[j] = tmp;
    render();
  }

  els.createBtn.addEventListener("click", async function () {
    if (!files.length) return;
    els.createBtn.disabled = true;
    showMsg("Building PDF…", "info");

    try {
      var pdf = await PDFDocument.create();
      var sizeMode = els.pageSize.value;
      var margin = parseInt(els.margin.value, 10);

      for (var i = 0; i < files.length; i++) {
        var f = files[i].file;
        var data = await readFileAsArrayBuffer(f);
        var img;
        if (f.type === "image/png") {
          img = await pdf.embedPng(data);
        } else if (f.type === "image/webp") {
          /* pdf-lib cannot embed WEBP directly: re-encode through a canvas first */
          img = await embedViaCanvas(pdf, f);
        } else {
          img = await pdf.embedJpg(data);
        }

        var iw = img.width, ih = img.height;

        if (sizeMode === "fit") {
          var page = pdf.addPage([iw + margin * 2, ih + margin * 2]);
          page.drawImage(img, { x: margin, y: margin, width: iw, height: ih });
        } else {
          var ps = PAGE_SIZES[sizeMode];
          var page2 = pdf.addPage([ps[0], ps[1]]);
          var availW = ps[0] - margin * 2;
          var availH = ps[1] - margin * 2;
          var scale = Math.min(availW / iw, availH / ih);
          var w = iw * scale, h = ih * scale;
          page2.drawImage(img, { x: (ps[0] - w) / 2, y: (ps[1] - h) / 2, width: w, height: h });
        }
      }

      var bytes = await pdf.save();
      var blob = new Blob([bytes], { type: "application/pdf" });
      downloadBlob(blob, "images.pdf");
      var totalIn = files.reduce(function (a, b) { return a + b.file.size; }, 0);
      showMsg("Done! images.pdf created — " + files.length + " page" + (files.length === 1 ? "" : "s") +
        ", " + formatBytes(blob.size) + ".", "ok");
      toast("images.pdf downloaded", "ok");
    } catch (err) {
      showMsg("Could not create PDF: " + (err.message || String(err)), "err");
    }
    els.createBtn.disabled = false;
  });

  /* Convert WEBP (or anything) to PNG via canvas, then embed */
  async function embedViaCanvas(pdf, file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        c.toBlob(async function (blob) {
          try {
            var buf = await blob.arrayBuffer();
            resolve(await pdf.embedPng(buf));
          } catch (e) { reject(e); }
        }, "image/png");
      };
      img.onerror = function () { reject(new Error("Could not decode " + file.name)); };
      img.src = URL.createObjectURL(file);
    });
  }

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = "msg " + (kind || "info");
  }

})();
