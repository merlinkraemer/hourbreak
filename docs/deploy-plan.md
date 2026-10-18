# Putting hourbreak online — plan

Status: proposal. Nothing has been deployed, no DNS touched, no repo pushed.

## What we are shipping

A fully static site. No build step, no framework, no server code. The publish directory is the
repo root.

| | |
|---|---|
| Working tree | 6.3 MB total, **92 files** |
| Largest single file | `vendor/three.js` 604 KB (151 KB gzipped) |
| Assets | `sounds/` 1.5 MB (42 clips), `tricks/` 289 KB (9 clips), `thumbs/` 376 KB (15), `banana/` 24 KB, `vendor/` 608 KB |
| Code | `index.html`, `style.css`, `app.js`, `banana.js`, `stars.js`, `confetti.js` — 60 KB |
| Runtime needs | HTTPS (ES modules + Web Audio), WebGL, no server |

Nothing here needs a build. Every host below can take the folder as-is.

## The thing you should decide first: the audio is not ours

Every sound on the site is somebody else's:

- `sounds/` — 42 clips ripped from YouTube with yt-dlp
- `tricks/` — 7 Tony Hawk sound effects from myinstants.com + 1 local opener sting
- `thumbs/` — 15 YouTube video thumbnails
- `banana/` — a GameCube Super Monkey Ball model rip from a fan resource site

Right now that is a private joke on localhost. On a public URL it is a public copy of
copyrighted material, and GitHub, Cloudflare and Vercel all publish DMCA processes and will act
on a complaint. GitHub additionally terminates accounts of repeat infringers, and its Terms say
you are responsible for having the right to post what you upload.

Practical consequences to accept or avoid:

| Posture | What it means |
|---|---|
| Low profile | Platform subdomain, no ads, no SEO, not linked anywhere public. Most likely nothing ever happens. A takedown, if one comes, costs you a deployment, not an account. |
| Replace the audio | Swap `sounds/` for CC0 clips (freesound.org, Pixabay) and re-run `scripts/fetch-sounds.sh` with your own list. The site stops being a meme site, which may be the point of it. |
| Keep it private | Cloudflare Access (free tier, up to 50 users) in front of the domain, or don't deploy at all. Note that a static host serves asset URLs directly — you cannot password-protect one folder without a proxy in front. |

My read: deploy it low-profile on a throwaway platform subdomain, don't buy a domain you would
be sad to lose, and keep the asset pipeline scripted (it already is) so replacing any of it is
one command.

## Hosting options

Facts checked October 2026 against each provider's own docs.

| | Cloudflare Pages | GitHub Pages | Vercel Hobby | Netlify Free |
|---|---|---|---|---|
| Free bandwidth | **unlimited, static** | 100 GB/mo soft | 100 GB/mo | ~15 GB effective (credit based) |
| Site/file limits | 20,000 files, 25 MiB/file | 1 GB site | 100 MB CLI upload | — |
| Builds | 500/mo | 10/hr soft (unlimited with Actions) | 100 deploys/day | 300 credits/mo |
| Commercial use on free | **allowed** | not for a business | **not allowed** | allowed |
| Custom domain + HTTPS | yes, up to 100 | yes, Let's Encrypt | yes, up to 50 | yes |
| Custom cache headers | yes (`_headers`) | no | yes (`vercel.json`) | yes |

Recommendation: **Cloudflare Pages**, then put a custom domain on it later if you want one.

- Unlimited static bandwidth means a Reddit hug does not turn into a bill or a paused site,
  which matters for a site whose whole payload is audio.
- No non-commercial clause, unlike Vercel Hobby.
- Free HTTPS, 100 custom domains per project.
- Caveat worth knowing: Cloudflare now steers new projects toward Workers-with-static-assets.
  Pages still works and is not deprecated, but new features land on Workers first. You can
  deploy to Pages today and move later; the folder is identical.

If you specifically want a `github.io` URL, GitHub Pages is fine too — it is free, takes a
public repo, and 100 GB/mo is far more than this will ever see. The tradeoff is no control over
cache headers and a repo that is publicly browsable as a source of the ripped audio, which is a
slightly louder legal footprint than an opaque asset URL on a CDN.

## Domains: what is actually free in 2026

**There are no free top-level domains left.** Freenom — the free `.tk`/`.ml`/`.ga`/`.cf`/`.gq`
registrar — settled with Meta in 2024 and exited the domain business, taking millions of domains
with it. It came back in 2026 selling `.tk`, `.cf` and `.gq` from about €8/year with no free
tier. No replacement has appeared. Also note `.xx` is not a real TLD, so
`1hourofsilenceinterruptedby.xx` cannot be registered at any price.

What you can actually get for free:

| Option | URL looks like | Cost | Effort | Catch |
|---|---|---|---|---|
| Platform subdomain | `hourbreak.pages.dev` | free | ~2 min | Rented land, platform branding |
| is-a.dev | `hourbreak.is-a.dev` | free | GitHub PR, reviewed | Must be a personal / non-commercial software project, and the request must be written by hand |
| is-a.bot | `hourbreak.is-a.bot` | free | same process | Same org, same rules |
| js.org | `hourbreak.js.org` | free | GitHub PR | Content must have a clear connection to JavaScript. A meme site does not qualify. |
| eu.org | `hourbreak.eu.org` | free | request form, ~14 days | Slow, no support, no relation to the EU |
| pp.ua / thedev.id / is-an.app / cluster.ws | various | free | varies | Same rented-land tradeoffs |
| Real domain | `1hourofsilence.fun` | ~$2 first year, ~$12–15 renewal | 10 min | You now own a name you might have to defend |

Long joke names are legal — each dot-separated label can be up to 63 characters, so
`1hourofsilenceinterruptedby.com` (32 chars) is fine. Cheap first-year TLDs to look at if you go
this route: `.xyz`, `.fun`, `.lol`, `.wtf`, `.ooo`, `.click`, `.site`. Registrars at cost:
Cloudflare Registrar, Porkbun. Expect renewals to be several times the promo price.

Candidate names, if you want one:

- `hourbreak.fun`, `hourbreak.wtf`, `hourbreak.lol` — short, cheap
- `1hourofsilence.fun`, `1hourofsilence.xyz`
- `boostx1000.com`
- `hourbreak.is-a.dev` — free, no purchase

## Recommended path (Cloudflare Pages, free subdomain)

1. **Pre-deploy cleanup** (5 min, local)
   - Delete the now-unused `fonts/` (16 KB) and the two `@font-face` blocks in `style.css` —
     the pixel font went away with the seven-segment timer, nothing references `--pixel`.
   - Confirm `.gitignore` excludes `.pi-subagents/`, `.vercel/`, `.DS_Store`.
2. **Create the project** — Cloudflare dashboard → Workers & Pages → Create → Pages →
   Upload assets. Project name `hourbreak`. Upload the repo root (drag the folder, or
   `npx wrangler pages deploy . --project-name hourbreak`).
   Publish directory is the repo root. No build command, no framework preset.
3. **Add cache headers** — Cloudflare Pages reads a `_headers` file at the publish root
   (GitHub Pages cannot do this; Vercel uses the existing `vercel.json`):
   ```
   /sounds/*
     Cache-Control: public, max-age=31536000, immutable
   /tricks/*
     Cache-Control: public, max-age=31536000, immutable
   /thumbs/*
     Cache-Control: public, max-age=31536000, immutable
   /banana/*
     Cache-Control: public, max-age=31536000, immutable
   /vendor/*
     Cache-Control: public, max-age=31536000, immutable
   /*
     X-Content-Type-Options: nosniff
   ```
4. **Verify the live URL** — `https://hourbreak.pages.dev`.

### If you prefer GitHub Pages instead

1. `git remote add origin git@github.com:<you>/hourbreak.git && git push -u origin main`
2. Add a file named `.nojekyll` at the repo root. Without it Jekyll processes the tree and can
   drop or mangle asset folders.
3. Repo Settings → Pages → Source `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Live at `https://<you>.github.io/hourbreak/` in about a minute.
5. Remember there is no `_headers` equivalent — you get GitHub's default caching.

## Deploy-day checks specific to this site

- **HTTPS is required**, not optional: the app is ES modules and uses Web Audio
  (`AudioContext` + `createMediaElementSource`), both of which need a secure context. All four
  hosts give free TLS.
- **Autoplay**: nothing plays until the visitor clicks `activate` — that gesture also resumes
  the AudioContext and warms all 51 clips. This is already handled; do not remove the resume.
- **Loudness**: the random noises are now deliberately pushed through a 3.6× gain into a soft
  clip, so they distort. There is currently **no volume control and no mute** on the page. Worth
  deciding before this faces other people's ears.
- **First sound takes 5–8 minutes.** A visitor who does not read the subtext will hear silence
  and leave. That is the joke, but it is also the bounce rate.
- **File types**: `.glb` is served as `application/octet-stream` by some hosts. GLTFLoader
  fetches it directly and does not care, so no MIME fix is needed.
- **`.mp3` range requests**: all four hosts support them; the audio elements are small enough
  that it does not matter either way.

## Post-deploy checks

1. `curl -I https://<url>/` returns 200 and `content-type: text/html`.
2. `curl -I https://<url>/sounds/oof.mp3` returns 200 `audio/mpeg`.
3. `curl -I https://<url>/banana/banana-bunch.glb` returns 200.
4. Open in a real browser: click `activate`, confirm the starfield appears, the banana speeds up,
   and the AudioContext state is `running` (not `suspended`).
5. Click the banana twice in a row and confirm the combo only registers when the second click
   lands in the window.
6. Check the console for zero errors, and `favicon.png` loads.
7. Test on a phone: audio unlock and the Web Audio path are the two things most likely to behave
   differently on iOS Safari.

## Decisions needed

1. Host: Cloudflare Pages (recommended, unlimited bandwidth) or GitHub Pages (if you want the
   `github.io` URL and a public repo).
2. Domain: free platform subdomain now, free `is-a.dev` via a hand-written PR, or buy one.
3. Copyright posture: low profile, replace the ripped audio, or keep it local.
4. Mute: add a volume/mute control before this faces anyone else.
