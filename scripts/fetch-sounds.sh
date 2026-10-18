#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIST="$ROOT/scripts/sounds.tsv"
OUT="$ROOT/sounds"
MANIFEST="$OUT/manifest.json"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

entries=()
while IFS=$'\t' read -r slug vid label maxlen; do
  [[ -z "${slug:-}" || "$slug" == \#* ]] && continue
  dest="$OUT/$slug.mp3"
  if [[ -f "$dest" && $FORCE -eq 0 ]]; then
    echo "skip   $slug (exists)"
  else
    echo "fetch  $slug <- https://youtu.be/$vid"
    ok=0
    for attempt in 1 2 3; do
      set +o pipefail
      yt-dlp --no-warnings --no-update --quiet --no-part -f bestaudio -o - "https://youtu.be/$vid" 2>"$TMP/$slug.err" \
        | ffmpeg -hide_banner -loglevel error -y -i pipe:0 -vn \
            -af "silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB,apad,atrim=0:${maxlen},asetpts=N/SR/TB,afade=t=in:st=0:d=0.004,afade=t=out:st=$(awk -v m="$maxlen" 'BEGIN{printf "%.3f", m-0.09}'):d=0.09,loudnorm=I=-15:TP=-1.5:LRA=9,alimiter=limit=-1.0dB:level=disabled" \
            -ac 1 -ar 32000 -b:a 64k -codec:a libmp3lame "$dest" || true
      set -o pipefail
      if [[ -s "$dest" ]] && [[ "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dest" 2>/dev/null || echo 0)" != "0" ]]; then
        ok=1
        break
      fi
      rm -f "$dest"
      [[ $attempt -lt 3 ]] && sleep $((attempt * 3))
    done
    if [[ $ok -eq 0 ]]; then
      echo "  FAILED $slug (3 attempts):" >&2
      sed 's/^/    /' "$TMP/$slug.err" >&2 || true
      continue
    fi
  fi
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dest")
  stats=$(ffmpeg -hide_banner -i "$dest" -af astats=metadata=1:reset=0 -f null - 2>&1)
  rms=$(echo "$stats" | grep 'RMS level dB' | tail -1 | awk '{print $NF}')
  peak=$(echo "$stats" | grep 'Peak level dB' | tail -1 | awk '{print $NF}')
  printf '  ok %-16s %5.2fs  rms %6s dB  peak %6s dB\n' "$slug" "$dur" "${rms:-?}" "${peak:-?}"
  if awk -v r="${rms:-0}" 'BEGIN{exit !(r < -40)}'; then
    echo "  WARN $slug is near-silent (rms ${rms} dB)" >&2
  fi
  if awk -v p="${peak:-0}" 'BEGIN{exit !(p > -1.0)}'; then
    echo "  note $slug peaks at ${peak} dB (loudnorm hit the true-peak ceiling)" >&2
  fi
  if awk -v d="$dur" 'BEGIN{exit !(d < 0.35)}'; then
    echo "  WARN $slug is suspiciously short (${dur}s)" >&2
  fi
  entries+=("$(node -e 'console.log(JSON.stringify({file:process.argv[1]+".mp3",label:process.argv[2],source:"https://youtu.be/"+process.argv[3],seconds:Number(process.argv[4])}))' "$slug" "$label" "$vid" "$(awk -v d="$dur" 'BEGIN{printf "%.2f", d}')")")
done < "$LIST"

{
  echo "["
  for i in "${!entries[@]}"; do
    if [[ $i -lt $((${#entries[@]} - 1)) ]]; then echo "  ${entries[$i]},"; else echo "  ${entries[$i]}"; fi
  done
  echo "]"
} > "$MANIFEST"

count=$(ls -1 "$OUT"/*.mp3 2>/dev/null | wc -l | tr -d ' ')
size=$(du -sh "$OUT" | cut -f1 | tr -d ' ')
echo "manifest: $MANIFEST ($count clips, $size)"
