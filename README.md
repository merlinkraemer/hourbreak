# hourbreak

One hour of silence, occasionally broken by completely random noises. Every gap is at
least 30 minutes.

It is not a productivity app. It is presented as a deep-fried, Geocities-era piece of
productivity software that never once admits what it actually does. You press START, you
leave the tab open because it told you to, and a metal pipe falls on your head twenty
minutes later.

Nothing on the page says "sound", "noise" or "silence" in the visitor-facing copy. The
sounds are "optimization modules", the volume slider is "intensity", and the 22-clip list is
hidden behind a collapsed "modules" panel so the first impression stays pristine.

The page is deliberately tiny: a WordArt header, one LCD timer, two buttons, three readout
numbers, one hint line, one collapsed panel, one footer link.

## Run it

```sh
python3 -m http.server 8080
open http://localhost:8080
```

No build step, no dependencies, no framework. `index.html`, `style.css`, `app.js`,
and a folder of 32 kHz mono mp3s.

## How the silence works

Each gap is drawn from one of three buckets, and never falls below **30 minutes**:

| bucket | weight | range |
|---|---|---|
| normal | 55% | 30m – 45m |
| long | 30% | 45m – 80m |
| very long | 15% | 80m – 150m |

Inside a bucket the value is skewed toward the low end with `Math.pow(random, 1.9)`. Measured
over 200k draws: min 30.0m, median 42.5m, p95 112.7m, max 150.0m, zero gaps under 30m. So a
1-hour session gets one or two noises, which is the point.

The **first** gap of a session is the one exception — 8–50 seconds, so you can confirm it
works before walking away. Everything after that obeys the 30-minute floor. There is also a
9% chance of a double noise 0.4–1.1s after the previous one, and no clip repeats within its
last three plays.

The countdown is hidden by default. There is a checkbox if you want to cheat.

## The aesthetic

Two layers stacked on purpose. Underneath: 1998 Geocities — tiled starfield, arced
WordArt logo, a `<marquee>`, beveled ridge borders, rainbow rule. On top: deep-fried meme —
whole-page saturate/contrast boost, a tiled turbulence overlay, chromatic aberration on the
wordmark, Impact everywhere with hard black outlines.

## The module library

22 clips, ripped from YouTube and squashed to 32 kHz mono. `scripts/sounds.tsv` is the
source of truth: `slug`, `youtube id`, on-screen label, max seconds.

```sh
bash scripts/fetch-sounds.sh          # skips clips that already exist
bash scripts/fetch-sounds.sh --force  # re-downloads everything
```

The script pipes YouTube audio straight into ffmpeg, which strips leading silence, trims to
the listed length, fades, normalizes to −15 LUFS, hard-limits at −1 dBFS, and writes
`sounds/<slug>.mp3`. It reports RMS and peak for every clip, regenerates
`sounds/manifest.json`, and retries a failed download three times.

To add a module: append a row to `scripts/sounds.tsv`, run the script, reload.

## The backdrops

15 YouTube thumbnails from the `1 hour of silence broken by` search, as fullscreen
cross-fading backgrounds. One image every 20 s with a 2.2 s fade and a slow ken-burns drift,
and the backdrop also advances immediately every time a module fires.

```sh
bash scripts/fetch-thumbs.sh                     # default query, 15 results
bash scripts/fetch-thumbs.sh "some query" 20
```

Tries `maxresdefault`, falls back to `hqdefault` then `mqdefault` when YouTube has no
high-res frame, crops to 1024x576, re-encodes to JPEG q5, and writes `thumbs/manifest.json`.
Thumbs already on disk are skipped. 15 thumbnails = 376 KB.

## Deploy

Static. `vercel.json` is set up for a plain static deploy with long cache headers on
`sounds/`.

```sh
vercel deploy
```
