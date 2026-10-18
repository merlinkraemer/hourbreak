#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUERY="${1:-1 hour of silence broken by}"
COUNT="${2:-15}"
OUT="$ROOT/thumbs"
MANIFEST="$OUT/manifest.json"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"
LIST="$TMP/list.tsv"

yt-dlp --no-warnings --no-update --quiet "ytsearch${COUNT}:${QUERY}" --flat-playlist \
  --print "%(id)s %(title)s" 2>/dev/null > "$LIST"

while read -r vid title; do
  [[ -z "$vid" ]] && continue
  dest="$OUT/$vid.jpg"
  if [[ -s "$dest" ]] && [[ "$(ffprobe -v error -select_streams v -show_entries stream=width -of csv=p=0 "$dest" 2>/dev/null || echo 0)" -ge 320 ]]; then
    echo "skip   $vid"
    continue
  fi
  picked=""
  for quality in maxresdefault hqdefault mqdefault; do
    if curl -sS --max-time 30 -f -o "$TMP/src.jpg" "https://i.ytimg.com/vi/$vid/$quality.jpg" 2>/dev/null; then
      if [[ "$(ffprobe -v error -select_streams v -show_entries stream=width -of csv=p=0 "$TMP/src.jpg" 2>/dev/null || echo 0)" -ge 320 ]]; then
        picked="$quality"
        break
      fi
    fi
  done
  if [[ -z "$picked" ]]; then
    echo "FAILED $vid (no usable thumbnail)" >&2
    continue
  fi
  ffmpeg -hide_banner -loglevel error -y -i "$TMP/src.jpg" -map_metadata -1 \
    -vf "scale=1024:576:force_original_aspect_ratio=increase,crop=1024:576" \
    -q:v 5 "$dest"
  echo "fetch  $vid  ($picked)  $(du -h "$dest" | cut -f1)"
done < "$LIST"

HB_LIST="$LIST" HB_OUT="$OUT" HB_MANIFEST="$MANIFEST" python3 - <<'PY'
import json, os

out = os.environ["HB_OUT"]
titles = {}
order = []
with open(os.environ["HB_LIST"], encoding="utf-8") as fh:
    for line in fh:
        line = line.rstrip("\n")
        if not line:
            continue
        vid, _, title = line.partition(" ")
        titles[vid] = title
        order.append(vid)

entries = []
for vid in order:
    path = os.path.join(out, vid + ".jpg")
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        continue
    entries.append({
        "file": vid + ".jpg",
        "title": titles.get(vid, vid),
        "source": "https://youtu.be/" + vid,
    })

with open(os.environ["HB_MANIFEST"], "w", encoding="utf-8") as fh:
    json.dump(entries, fh, indent=2)
    fh.write("\n")

size = sum(os.path.getsize(os.path.join(out, e["file"])) for e in entries)
print("manifest: %s (%d thumbs, %.0f KB)" % (os.environ["HB_MANIFEST"], len(entries), size / 1024))
PY
