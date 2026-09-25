#!/usr/bin/env bash
# ---------------------------------------------------------------
# PixelAbs Tools — vendor library fetcher
# Downloads the three JavaScript libraries the tools depend on
# (pinned versions, sha256-verified) into assets/vendor/.
#
# Run once before local development, and as the Cloudflare Pages
# build command. The deployed site serves everything from its own
# origin — zero third-party requests in the browser.
# ---------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p assets/vendor

fetch() { # $1 = url, $2 = destination, $3 = sha256
  if [ -f "$2" ] && echo "$3  $2" | sha256sum -c --quiet >/dev/null 2>&1; then
    echo "✓ $2 (already present, checksum OK)"
    return 0
  fi
  echo "↓ downloading $2 …"
  curl -fsSL "$1" -o "$2"
  echo "$3  $2" | sha256sum -c --quiet
  echo "✓ $2 (verified)"
}

fetch "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js" \
      "assets/vendor/pdf-lib.min.js" \
      "0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f"

fetch "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" \
      "assets/vendor/jszip.min.js" \
      "acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e"

fetch "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" \
      "assets/vendor/qrcode.min.js" \
      "c541ef06327885a8415bca8df6071e14189b4855336def4f36db54bde8484f36"

echo "Vendor libraries ready."
