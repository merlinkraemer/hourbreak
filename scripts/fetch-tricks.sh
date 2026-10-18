#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/tricks"
MANIFEST="$OUT/manifest.json"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"

LIST="special-trick|tony-hawk-special-trick-sound-effect.mp3|SPECIAL TRICK
combo-1|tony-hawk-trick-combo-1.mp3|COMBO 1
combo-2|tony-hawk-trick-combo-2.mp3|COMBO 2
combo-3|tony-hawk-trick-combo-3.mp3|COMBO 3
combo-4|tony-hawk-trick-combo-4.mp3|COMBO 4
combo-5|tony-hawk-trick-combo-5.mp3|COMBO 5
combo-6|tony-hawk-trick-combo-6.mp3|COMBO 6
combo-7|tony-hawk-trick-combo-7.mp3|COMBO 7"

while IFS='|' read -r slug remote label; do
  [[ -z "$slug" ]] && continue
  dest="$OUT/$slug.mp3"
  if [[ -s "$dest" ]]; then
    echo "skip   $slug"
    continue
  fi
  echo "fetch  $slug"
  curl -sS -m 45 -f -o "$TMP/raw.mp3" \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" \
    -H "Referer: https://www.myinstants.com/en/search/?name=tony%20hawk" \
    "https://www.myinstants.com/media/sounds/$remote"
  ffmpeg -hide_banner -loglevel error -y -i "$TMP/raw.mp3" -map_metadata -1 \
    -af "silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB,apad,atrim=0:4,asetpts=N/SR/TB,afade=t=in:st=0:d=0.004,afade=t=out:st=3.91:d=0.09,loudnorm=I=-15:TP=-1.5:LRA=9,alimiter=limit=-1.0dB:level=disabled" \
    -ac 1 -ar 32000 -b:a 64k -codec:a libmp3lame "$dest"
  printf '  ok %-14s %5.2fs  %s\n' "$slug" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dest")" "$label"
done <<< "$LIST"

HB_OUT="$OUT" HB_MANIFEST="$MANIFEST" python3 - <<'PY'
import json, os

out = os.environ["HB_OUT"]
order = ["special-trick"] + ["combo-%d" % i for i in range(1, 8)]
labels = {"special-trick": "SPECIAL TRICK"}
for i in range(1, 8):
    labels["combo-%d" % i] = "COMBO %d" % i

entries = []
for slug in order:
    path = os.path.join(out, slug + ".mp3")
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        continue
    entries.append({"file": slug + ".mp3", "label": labels[slug]})

with open(os.environ["HB_MANIFEST"], "w", encoding="utf-8") as fh:
    json.dump(entries, fh, indent=2)
    fh.write("\n")

size = sum(os.path.getsize(os.path.join(out, e["file"])) for e in entries)
print("tricks/manifest.json  %d sounds  %.0f KB" % (len(entries), size / 1024))
PY
