# hourbreak

One hour of silence, occasionally broken by completely random noises.

The joke: you leave the tab open, forget about it, and a metal pipe falls on your head
twenty minutes later. The gaps are drawn from a heavy-tailed random distribution, so the
site never settles into a rhythm you can feel.

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

## The noise library

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

To add a noise: append a row to `scripts/sounds.tsv`, run the script, reload.

## Deploy

Static. `vercel.json` is set up for a plain static deploy with long cache headers on
`sounds/`.

```sh
vercel deploy
```
