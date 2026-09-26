# PixelAbs Tools

**Free online utilities. No login. No ads. No uploads.**

A privacy-first suite of everyday web tools that run **100% inside your browser**. Files are never uploaded to any server — everything is processed locally on your device, so it's fast, free forever, and completely private.

## Tools

| Tool | What it does |
|---|---|
| 🗜️ **Image Compressor** | Compress images to an exact target size (e.g. *under 50 KB* for online forms) using a binary-search algorithm on a Web Worker |
| 🔄 **Image Converter** | Bulk convert between JPG, PNG and WEBP |
| 📐 **Image Resizer** | Resize by pixels or presets — passport photos (35×45mm), signatures, Instagram, YouTube thumbnails and more |
| 📑 **PDF Merge** | Combine multiple PDFs into one, in any order |
| ✂️ **PDF Split & Extract** | Extract page ranges (like 3–7) or split every page into its own PDF |
| 🖼️ **Images to PDF** | Turn photos and scans into a single PDF with page-size and margin options |
| { } **JSON Formatter** | Beautify, minify and validate JSON with precise error positions |
| Aa **Text Case Converter** | UPPER, lower, Title, Sentence, camelCase, PascalCase, snake_case, kebab-case |
| 🔐 **Base64 Encoder/Decoder** | UTF-8 safe text conversion + file-to-Base64 |
| 📱 **QR Code Generator** | Custom colors, sizes and error-correction levels, PNG download |

## Why it's different

- **Zero authentication** — no sign-up, sign-in, or cookies for accounts
- **100% ad-free** — no banners, pop-ups, or third-party trackers
- **Privacy-first** — every computation happens in your browser (Web Workers + OffscreenCanvas); your files never leave your device
- **Works offline** — installable PWA with a service worker caching every tool
- **Batch processing** — drop dozens of files at once, download results as a single ZIP
- **Smart target-size compression** — enter "50 KB" and the algorithm finds the best quality that fits, auto-scaling dimensions if needed
- **Keyboard friendly** — paste screenshots directly with Ctrl/Cmd + V

## Tech stack

- Plain **HTML5 + CSS3 + vanilla ES6 JavaScript** — no framework, no bundler, no npm install
- pdf-lib — PDF creation & manipulation
- JSZip — bulk ZIP downloads
- qrcodejs — QR generation

These libraries (plus the Inter variable font) are **vendored at build time** (`build.sh` downloads pinned, sha256-verified copies into `assets/vendor/` and `assets/fonts/`), so the deployed site serves everything from its own origin — no CDN requests, ever.
- **Web Workers + OffscreenCanvas** for non-blocking image compression
- **PWA** — `manifest.json` + service worker (`sw.js`)
- Zero runtime dependencies on external CDNs — all assets are served from this repo

## Project structure

```
├── index.html                  # homepage / tool directory
├── 404.html                    # not-found page
├── manifest.json               # PWA manifest
├── sw.js                       # service worker (offline support)
├── _headers                    # Cloudflare Pages security headers
├── assets/
│   ├── css/style.css           # design system (glassmorphism, dark/light themes)
│   ├── js/
│   │   ├── common.js           # theme, dropzones, toasts, helpers
│   │   ├── compress-worker.js  # Web Worker: target-size compression
│   │   └── tools/*.js          # one file per tool
│   ├── vendor/                 # pdf-lib, jszip, qrcode (fetched by build.sh)
│   ├── fonts/                  # Inter variable font (fetched by build.sh)
│   └── img/                    # icons
└── tools/                      # one page per tool
```

## Deploy to Cloudflare Pages (2 minutes)

1. Push this repo to your GitHub account.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Select this repository and click **Begin setup**.
4. Build settings:
 - **Framework preset:** `None`
 - **Build command:** `bash build.sh`
 - **Build output directory:** `/`
5. Click **Save and Deploy** — you'll get a free `https://<name>.pages.dev` URL with unlimited bandwidth and a global CDN.

The build command fetches the three vendored JavaScript libraries plus the Inter variable font (pinned versions, checksum-verified) so the live site is fully self-hosted with zero third-party requests. Every push to the main branch auto-deploys.

### Custom domain (optional)

In your Pages project → **Custom domains** → add `tools.yourdomain.com`. If the domain's DNS is already on Cloudflare, the CNAME record is created for you.

## Local development

One-time setup (downloads the vendored libraries):

```bash
bash build.sh
```

Then serve the folder (or just open `index.html`):

```bash
npx serve .
# or
python3 -m http.server 8000
```

## License

MIT — see LICENSE. Free to use, modify and deploy.
