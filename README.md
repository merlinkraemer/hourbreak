# hourbreak

A productivity app.

It is not a productivity app. It says `PRODUCTIVITY BOOST X1000`, tells you to activate it and
leave the tab running, and then plays one completely random noise every 30+ minutes for as long
as you leave it open. No visitor-facing copy ever admits what it does.

## Run it

```sh
python3 -m http.server 8080
open http://localhost:8080
```

No build step. `index.html`, `style.css`, `app.js`, `objects.js`, `vendor/three.js`, and four
asset folders.

## The page

Deliberately tiny — 273 characters of text:

- a title, `PRODUCTIVITY BOOST X1000`
- a status line and a big pixel-font timer
- one Comic Sans button, `activate` / `deactivate`
- a hint: *leave me running and just do your thing my guy! feel your productivity go up
  instantly!*
- an `OPTIMIZATIONS / SESSION LEFT / NEXT SYNC` readout
- session length, intensity, show-sync-timer controls
- a collapsed `22 MODULES` panel holding the noise list and per-clip preview buttons

Type is self-hosted [Silkscreen](fonts/OFL.txt) (3.5 KB per weight, OFL). The timer is green on
black; the button is the only strong colour on the page.

## The silence

Each gap is drawn from one of three buckets and never falls below **30 minutes**:

| bucket | weight | range |
|---|---|---|
| normal | 55% | 30m – 45m |
| long | 30% | 45m – 80m |
| very long | 15% | 80m – 150m |

Skewed toward the low end with `Math.pow(random, 1.9)`. Measured over 200k draws: min 30.0m,
median 42.5m, p95 112.7m, zero gaps under 30m.

The **first** gap is the one exception — 8–50 seconds, so you can confirm it works before
walking away. There is a 9% chance of a double noise 0.4–1.1 s after the previous one, and no
clip repeats within its last three plays.

The countdown is hidden behind `??:??` until you tick `SHOW SYNC TIMER`.

## The backdrops

15 YouTube thumbnails from the `1 hour of silence broken by` search, as fullscreen cross-fading
backgrounds. One image every 20 s, 2.2 s fade, slow ken-burns drift, and the backdrop advances
immediately whenever a module fires.

```sh
bash scripts/fetch-thumbs.sh                     # default query, 15 results
bash scripts/fetch-thumbs.sh "some query" 20
```

Tries `maxresdefault`, falls back to `hqdefault` then `mqdefault`, crops to 1024x576, re-encodes
to JPEG q5, writes `thumbs/manifest.json`. 15 thumbs = 376 KB.

## The floating objects

25 low-poly objects from the Katamari Damacy object set, spinning and drifting across the screen
2–3 at a time behind the page content.

```sh
bash scripts/build-models.sh 25                  # count is optional
```

Reads the 17.5 MB `katamari-object-models-glb-v3.zip` (path overridable with
`HB_KATAMARI_ZIP`), filters the 1703 GLBs to those under 60 KB with 40–900 triangles and no
alpha-blend materials, then takes `count` of them evenly spaced through the sorted list so the
selection is deterministic and varied. Writes `models/` plus `models/manifest.json`. 25 models
= 584 KB.

One wrinkle: the zip's host resolves to a content-filter address on some networks, so the
script falls back to a Cloudflare-DNS-over-HTTPS lookup and feeds the real IP to `curl
--resolve`.

## three.js

`vendor/three.js` is a minified esbuild bundle of three.js plus `GLTFLoader`, tree-shaken down
to only what the object layer uses (601 KB raw, **151 KB gzipped**).

```sh
bash scripts/vendor-three.sh
```

Installs `three` + `esbuild` into a temp dir, bundles `scripts/three-entry.js`, and writes
`vendor/three.js` with the version in `vendor/three.version`. Nothing is installed into the
project — no `node_modules`. Edit `scripts/three-entry.js` to change what gets bundled.

## Assets

| folder | size | what |
|---|---|---|
| `sounds/` | 800 KB | 22 noises, 32 kHz mono mp3 |
| `models/` | 584 KB | 25 Katamari GLBs |
| `thumbs/` | 376 KB | 15 background thumbnails |
| `vendor/` | 608 KB | three.js bundle (151 KB gzipped) |
| `fonts/` | 16 KB | Silkscreen 400 + 700 |

## The noises

`scripts/sounds.tsv` is the source of truth: `slug`, `youtube id`, on-screen label, max seconds.

```sh
bash scripts/fetch-sounds.sh          # skips clips that already exist
bash scripts/fetch-sounds.sh --force
```

Pipes YouTube audio straight into ffmpeg, which strips leading silence, trims, fades, normalizes
to −15 LUFS, hard-limits at −1 dBFS, and writes `sounds/<slug>.mp3`. Reports RMS and peak per
clip, regenerates the manifest, retries failures three times. To add one: append a row, run the
script, reload.

## Deploy

Static. `vercel.json` sets long cache headers on `sounds/`, `models/`, `thumbs/`, `fonts/`, and
`vendor/`.

```sh
vercel deploy
```
