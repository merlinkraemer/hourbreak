#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COUNT="${1:-25}"
ZIP="${HB_KATAMARI_ZIP:-/tmp/katamari-object-models-glb-v3.zip}"
HOST="pub-13a5286ea5b347fbb60687b5ebb02b5a.r2.dev"
URL="https://$HOST/downloads/katamari-object-models-glb-v3.zip"

if [[ ! -s "$ZIP" ]]; then
  echo "fetching $URL"
  if ! curl -sS --max-time 300 -f -o "$ZIP" "$URL"; then
    IP="$(curl -sS --max-time 20 "https://cloudflare-dns.com/dns-query?name=$HOST&type=A" \
      -H 'accept: application/dns-json' \
      | python3 -c "import sys,json;print([a['data'] for a in json.load(sys.stdin).get('Answer',[]) if a.get('type')==1][0])")"
    echo "local resolver lies about $HOST; using DoH answer $IP"
    curl -sS --max-time 300 -f -o "$ZIP" --resolve "$HOST:443:$IP" "$URL"
  fi
fi

HB_ZIP="$ZIP" HB_OUT="$ROOT/models" HB_COUNT="$COUNT" python3 - <<'PY'
import json, os, struct, zipfile

zip_path = os.environ["HB_ZIP"]
out_dir = os.environ["HB_OUT"]
count = int(os.environ["HB_COUNT"])
MAX_BYTES = 60 * 1024
MIN_TRIS, MAX_TRIS = 40, 900

os.makedirs(out_dir, exist_ok=True)


def gltf_json(data):
    _, _, _ = struct.unpack("<III", data[:12])
    chunk_len, _ = struct.unpack("<II", data[12:20])
    return json.loads(data[20:20 + chunk_len].decode("utf-8"))


def stats(gltf):
    tris = 0
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    opaque = True
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            attrs = prim.get("attributes", {})
            if "indices" in prim:
                tris += gltf["accessors"][prim["indices"]].get("count", 0) // 3
            pos = attrs.get("POSITION")
            if pos is None:
                return None
            accessor = gltf["accessors"][pos]
            amin, amax = accessor.get("min"), accessor.get("max")
            if not amin or not amax:
                return None
            for i in range(3):
                lo[i] = min(lo[i], amin[i])
                hi[i] = max(hi[i], amax[i])
    for material in gltf.get("materials", []):
        if material.get("alphaMode") == "BLEND":
            opaque = False
    radius = 0.5 * sum((hi[i] - lo[i]) ** 2 for i in range(3)) ** 0.5
    if radius <= 0:
        return None
    return tris, radius, opaque


def pretty(filename):
    stem = os.path.basename(filename).rsplit(".", 1)[0]
    parts = stem.split("_")
    if len(parts) > 1 and len(parts[0]) == 4 and all(c in "0123456789abcdef" for c in parts[0].lower()):
        parts = parts[1:]
    return " ".join(parts).strip() or stem


with zipfile.ZipFile(zip_path) as archive:
    names = sorted(n for n in archive.namelist() if n.lower().endswith(".glb"))
    candidates = []
    for name in names:
        if archive.getinfo(name).file_size > MAX_BYTES:
            continue
        try:
            parsed = stats(gltf_json(archive.read(name)))
        except Exception:
            continue
        if parsed is None:
            continue
        tris, radius, opaque = parsed
        if not (MIN_TRIS <= tris <= MAX_TRIS) or not opaque:
            continue
        candidates.append((name, tris, radius))

    if not candidates:
        raise SystemExit("no candidates survived the filter")

    step = len(candidates) / count
    picked = [candidates[min(int(i * step), len(candidates) - 1)] for i in range(count)]

    entries = []
    for name, tris, radius in picked:
        target = os.path.join(out_dir, os.path.basename(name))
        with open(target, "wb") as fh:
            fh.write(archive.read(name))
        entries.append({
            "file": os.path.basename(name),
            "name": pretty(name),
            "radius": round(radius, 4),
            "tris": tris,
        })

with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as fh:
    json.dump(entries, fh, indent=2)
    fh.write("\n")

total = sum(os.path.getsize(os.path.join(out_dir, e["file"])) for e in entries)
print("candidates: %d of %d" % (len(candidates), len(names)))
print("picked %d models, %.0f KB total" % (len(entries), total / 1024))
for entry in entries:
    print("  %-28s %5d tris  r=%.3f" % (entry["name"], entry["tris"], entry["radius"]))
PY
