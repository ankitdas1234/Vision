#!/usr/bin/env bash
# Rebuilds the native addons (canvas, ffmpeg-static) using this machine's
# OWN system Node headers instead of downloading a fresh copy from
# nodejs.org — for environments where the normal npm postinstall flow
# fails like this:
#
#   npm error gyp http 403 https://nodejs.org/download/release/.../node-v...-headers.tar.gz
#   npm error node-pre-gyp ERR! install response status 404 ... canvas-...tar.gz
#
# WHY THIS WORKS, AND WHY IT'S SAFE: the NodeSource `nodejs` .deb package
# (the one installed by the standard nodesource setup script, `apt install
# nodejs` after adding deb.nodesource.com, or any distro packaging that
# forked from it) already ships the complete C/C++ header tree under
# /usr/include/node — the exact headers node-gyp would otherwise fetch
# over the network. `dpkg -L nodejs | grep /usr/include/node` confirms it.
# The only problem is the directory layout: node-gyp expects a source-tree
# shape (include/node/*.h, deps/openssl/openssl/include/*, deps/uv/include,
# deps/v8/include, src/*.h), while the .deb lays every header flat in one
# directory. This script recreates that expected shape with symlinks —
# no files are copied or modified, and nothing here touches how Node
# actually runs.
#
# If /usr/include/node isn't present (Node installed a different way —
# nvm, a plain tarball, etc.) this script says so and exits 0 without
# doing anything; run a normal `npm rebuild <pkg>` instead, which will use
# whatever network access is actually available in that case.
#
# Usage:  ./scripts/setup-native-deps.sh          (canvas + ffmpeg-static)
#         ./scripts/setup-native-deps.sh canvas    (just one package)
set -euo pipefail

NODE_HEADERS=/usr/include/node
PACKAGES=("${@:-canvas ffmpeg-static}")
# shellcheck disable=SC2206
PACKAGES=(${PACKAGES[@]})

if [ ! -f "$NODE_HEADERS/node_version.h" ]; then
  echo "No system Node headers found at $NODE_HEADERS — this machine's Node"
  echo "wasn't installed from the NodeSource .deb, so this shortcut doesn't"
  echo "apply. Just run 'npm rebuild ${PACKAGES[*]}' with normal internet"
  echo "access to nodejs.org instead."
  exit 0
fi

echo "Found system Node headers at $NODE_HEADERS — reshaping them into the"
echo "layout node-gyp expects, so canvas/ffmpeg-static can build without"
echo "downloading anything from nodejs.org."

link() { # link TARGET LINK_PATH — only replaces LINK_PATH if it's ours
  mkdir -p "$(dirname "$2")"
  if [ -e "$2" ] && [ ! -L "$2" ]; then
    return 0 # a real file/dir is already there — leave it alone
  fi
  ln -sfn "$1" "$2"
}

link "$NODE_HEADERS"          "$NODE_HEADERS/include/node"
link "$NODE_HEADERS"          "$NODE_HEADERS/src"
link "$NODE_HEADERS/openssl"  "$NODE_HEADERS/deps/openssl/config"
link "$NODE_HEADERS/openssl"  "$NODE_HEADERS/deps/openssl/openssl/include"
link "$NODE_HEADERS"          "$NODE_HEADERS/deps/uv/include"
link "$NODE_HEADERS"          "$NODE_HEADERS/deps/v8/include"
mkdir -p "$NODE_HEADERS/deps/zlib"
link "$NODE_HEADERS/zlib.h"   "$NODE_HEADERS/deps/zlib/zlib.h"

FAILED=()
for pkg in "${PACKAGES[@]}"; do
  echo ""
  echo "== $pkg =="
  if [ "$pkg" = "canvas" ]; then
    # canvas still needs its own native library headers (Cairo, Pango,
    # JPEG, GIF, RSVG). On Debian/Ubuntu:
    #   apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev \
    #     libgif-dev librsvg2-dev pkg-config build-essential
    # is required once, and *is* reachable through archive.ubuntu.com even
    # when nodejs.org/storage.googleapis.com are not.
    if (cd "node_modules/$pkg" 2>/dev/null && npx --yes node-gyp rebuild --nodedir="$NODE_HEADERS"); then
      echo "$pkg: built OK"
    else
      FAILED+=("$pkg")
    fi
  else
    if npm rebuild "$pkg" --nodedir="$NODE_HEADERS" 2>/dev/null || npm rebuild "$pkg"; then
      echo "$pkg: built OK"
    else
      FAILED+=("$pkg")
    fi
  fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "Still failed: ${FAILED[*]}"
  echo "For canvas, double-check the Cairo/Pango/JPEG/GIF/RSVG -dev packages"
  echo "above are installed. For anything else, it likely needs real"
  echo "internet access this script can't substitute for."
  exit 1
fi

echo ""
echo "Done. Verify with:  node -e \"require('canvas'); console.log('canvas OK')\""
