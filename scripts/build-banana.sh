#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL="${1:-OBJ_BANANA_02_LOD100}"
ZIP="${HB_BANANA_ZIP:-$HOME/Downloads/GameCube - Super Monkey Ball - Items - Banana & Banana Bunch.zip}"
OUT="$ROOT/banana"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ ! -s "$ZIP" ]]; then
  echo "missing zip: $ZIP" >&2
  echo "set HB_BANANA_ZIP to the Super Monkey Ball items archive" >&2
  exit 1
fi

mkdir -p "$OUT" "$WORK/src"
unzip -q -o "$ZIP" -d "$WORK/src"

SRC="$WORK/src/banana"
[[ -d "$SRC" ]] || SRC="$(find "$WORK/src" -type d -name banana -print -quit)"
[[ -n "$SRC" && -f "$SRC/$MODEL.obj" ]] || { echo "no $MODEL.obj in the archive" >&2; exit 1; }

cp "$SRC/$MODEL.obj" "$WORK/$(basename "$MODEL").obj"
cp "$SRC/$MODEL.mtl" "$WORK/$(basename "$MODEL").mtl"
sed -i '' "s/$MODEL\.mtl/$(basename "$MODEL").mtl/" "$WORK/$(basename "$MODEL").obj"
grep -o 'map_Kd .*' "$WORK/$(basename "$MODEL").mtl" | awk '{print $2}' | while read -r tex; do
  cp "$SRC/$tex" "$WORK/$tex"
done

cd "$WORK"
npx --yes obj2gltf@3.2.0 -i "$(basename "$MODEL").obj" -o "$OUT/banana-bunch.glb" -b

python3 - "$OUT/banana-bunch.glb" <<'PY'
import json, os, struct, sys

path = sys.argv[1]
data = open(path, "rb").read()
chunk, _ = struct.unpack("<II", data[12:20])
gltf = json.loads(data[20:20 + chunk].decode("utf-8"))
tris = 0
for mesh in gltf.get("meshes", []):
    for prim in mesh.get("primitives", []):
        if "indices" in prim:
            tris += gltf["accessors"][prim["indices"]]["count"] // 3
print("banana/banana-bunch.glb  %.0f KB  %d tris  %d textures  %d materials" % (
    os.path.getsize(path) / 1024, tris, len(gltf.get("images", [])), len(gltf.get("materials", []))))
PY
