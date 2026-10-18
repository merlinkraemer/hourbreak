#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$VENDOR"
cd "$WORK"
npm init -y >/dev/null 2>&1

echo "installing three + esbuild"
npm install --silent --no-audit --no-fund three@latest esbuild@latest >/dev/null 2>&1

VERSION="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("node_modules/three/package.json","utf8")).version)')"
echo "three $VERSION"

cp "$ROOT/scripts/three-entry.js" "$WORK/three-entry.js"

npx esbuild "three-entry.js" \
  --bundle --minify --format=esm --target=es2020 \
  --legal-comments=none --outfile="$VENDOR/three.js"

printf '%s\n' "$VERSION" > "$VENDOR/three.version"

raw=$(wc -c < "$VENDOR/three.js" | tr -d ' ')
gz=$(gzip -9 -c "$VENDOR/three.js" | wc -c | tr -d ' ')
printf 'vendor/three.js  %.0f KB raw  %.0f KB gzipped  (three %s)\n' "$(echo "$raw / 1024" | bc -l)" "$(echo "$gz / 1024" | bc -l)" "$VERSION"
