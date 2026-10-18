# hourbreak

A productivity app.

It is not a productivity app. It is one hour of silence, occasionally broken by
completely random noises — presented as a deep-fried, Geocities-era piece of
productivity software that never once admits what it actually does. You press the big
button, you leave the tab open because it told you to, and a metal pipe falls on your
head twenty minutes later.

Nothing on the page says "sound", "noise" or "silence" in the visitor-facing copy. The
sounds are "optimization modules", the log is a "live productivity feed", the volume
slider is "intensity", and the 22-clip list is hidden behind a collapsed
"soundscape engine spec" panel so the first impression stays pristine.

The gaps are drawn from a heavy-tailed random distribution, so the site never settles
into a rhythm you can feel.

## Run it

```sh
python3 -m http.server 8080
open http://localhost:8080
```

No build step, no dependencies, no framework. `index.html`, `style.css`, `app.js`,
and a folder of 32 kHz mono mp3s.

## How the silence works

Each gap is drawn from one of three buckets:

| bucket | weight | range |
|---|---|---|
| normal | 62% | 18s – 2m 25s |
| long | 28% | 2m 25s – 6m |
| very long | 10% | 6m – 13m |

Inside a bucket the value is skewed toward the low end with `Math.pow(random, 1.9)`, so
most gaps are short and a few are enormous. The first gap of a session is deliberately
short (7–45s) so you can see that it works. There is a 9% chance of a double noise 0.4–1.1s
after the previous one, and no clip repeats within its last three plays.

The countdown is hidden by default. There is a checkbox if you want to cheat.

## The aesthetic

Two layers stacked on purpose. Underneath: 1998 Geocities — tiled starfield, arced
WordArt logo, `<marquee>`, beveled ridge borders, a visitor counter, webring navigation,
an 88x31-ish badge row. On top: deep-fried meme — whole-page saturate/contrast boost, a
tiled turbulence overlay, a spinning starburst behind the logo, chromatic aberration on
the wordmark, Impact everywhere with hard black outlines, and a few emoji.

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

## Deploy

Static. `vercel.json` is set up for a plain static deploy with long cache headers on
`sounds/`.

```sh
vercel deploy
```
