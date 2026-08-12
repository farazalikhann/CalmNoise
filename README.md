# CalmNoise — White Noise & Focus Sounds

A calming, SEO-optimized ambient sound mixer. 100% client-side: no backend,
no login, no server-side audio processing. Built with Astro + Tailwind CSS,
audio powered entirely by the Web Audio API.

## Project structure

```text
/
├── public/
│   ├── icons/                 PWA icons (generated — see scripts/generate-icons.mjs)
│   ├── sounds/                Drop CC0 nature-sound mp3s here (see sounds/README.md)
│   ├── worklets/
│   │   └── noise-processor.js AudioWorklet that generates white/pink/brown noise
│   ├── manifest.webmanifest   PWA manifest
│   ├── sw.js                  Offline-support service worker
│   └── og-image.png           Social share image (generated)
├── scripts/
│   └── generate-icons.mjs     Regenerates PWA icons + OG image (no image deps)
├── src/
│   ├── components/
│   │   ├── SEO.astro          <title>/meta/canonical/OG + JSON-LD injection
│   │   ├── Header.astro / Footer.astro
│   │   ├── AdSlot.astro       Responsive AdSense placeholder wrapper
│   │   ├── Mixer.astro        The interactive mixer island (markup + inline script)
│   │   └── SoundCard.astro    One sound tile (icon, name, volume slider)
│   ├── config/
│   │   ├── site.ts            Site name/URL/description used across the app
│   │   ├── ads.ts             AdSense client ID + ad slot IDs (TODO placeholders)
│   │   └── sounds.ts          The sound catalog + presets — edit this to add sounds
│   ├── layouts/
│   │   └── BaseLayout.astro   <html> shell, ambient background, SW registration
│   ├── scripts/
│   │   ├── audio-engine.ts    All Web Audio logic (noise gen, buffer loops, gains,
│   │   │                      master transport, sleep timer, presets, localStorage)
│   │   └── mixer-ui.ts        Wires audio-engine.ts to the DOM markup in Mixer.astro
│   └── pages/
│       ├── index.astro        Homepage: mixer + SEO content + FAQ (with FAQPage schema)
│       ├── about.astro / contact.astro / privacy-policy.astro / terms.astro
│       └── robots.txt.ts      Generated from src/config/site.ts
└── astro.config.mjs           Tailwind v4 (vite plugin) + @astrojs/sitemap
```

## Commands

| Command           | Action                                              |
| ------------------ | ---------------------------------------------------- |
| `npm install`       | Install dependencies                                  |
| `npm run dev`       | Start the dev server at `localhost:4321`              |
| `npm run build`     | Build the production site to `./dist/`                |
| `npm run preview`   | Preview the production build locally                  |
| `npm run icons`     | Regenerate PWA icons + OG image (`scripts/generate-icons.mjs`) |

Procedural noise (white/pink/brown) works immediately with zero setup. The
nature-sound cards (rain, thunderstorm, ocean, forest, cafe, fireplace, fan)
will show as playable but do nothing audible until you add real audio files —
see the next section.

## Adding the nature-sound audio files

No third-party audio ships with this repo. Add CC0 ("no rights reserved")
`.mp3` files to `public/sounds/` using the **exact filenames** listed in
[`public/sounds/README.md`](public/sounds/README.md) (e.g. `rain.mp3`,
`ocean.mp3`). Good sources: [Pixabay Sound Effects](https://pixabay.com/sound-effects/)
and [Freesound.org](https://freesound.org/) filtered to CC0 license. That file
also has tips for making a clean, pop-free loop point.

If a file is missing, its card still renders normally; only when a user taps
it does the app try to fetch/decode it, and on failure it shows a small
"Audio file not found" note on that card instead of throwing — nothing else
on the page is affected.

## Adding a new sound

1. Drop the audio file in `public/sounds/` (skip this step for a
   procedurally-generated noise type).
2. Add an entry to the `SOUNDS` array in `src/config/sounds.ts`: a unique
   `id`, `name`, `kind` (`'file'` or `'noise'`), the `file` name or
   `noiseType`, an inline SVG `icon` (stroke-based, 24x24 viewBox), and a
   `defaultVolume`.

That's it — the grid, presets, sleep timer, and localStorage persistence all
pick up new entries automatically; no other file needs to change.

## Configuring AdSense

Ad placements (header banner, below the mixer, and a desktop sidebar) already
exist as responsive placeholder boxes marked with `<!-- AdSense: ... -->`
comments. To go live:

1. Edit `src/config/ads.ts`: set `ADSENSE_CLIENT_ID`, the three `AD_SLOTS`
   IDs, and flip `ADSENSE_ENABLED` to `true`.
2. Uncomment the AdSense loader `<script>` in `src/layouts/BaseLayout.astro`
   (search for "AdSense loader").

Until then, the placeholders render as empty, clearly-labeled boxes — the
site never ships a broken or misconfigured ad call.

## SEO

- `src/components/SEO.astro` renders title/description/canonical/OpenGraph
  tags and injects JSON-LD (`WebApplication` schema on every page, plus
  `FAQPage` schema on the homepage).
- `@astrojs/sitemap` auto-generates `sitemap-index.xml` at build time;
  `src/pages/robots.txt.ts` points to it.
- Before deploying, update `SITE_URL` in `astro.config.mjs` and `SITE.url` in
  `src/config/site.ts` to your real domain — canonical URLs, OG tags, and the
  sitemap all derive from it.

## PWA / offline support

- `public/manifest.webmanifest` — installable app metadata.
- `public/sw.js` — network-first for page navigations, stale-while-revalidate
  for static assets/audio, so the app (and any nature sounds you've already
  played once) keep working offline.
- Icons are generated PNGs (no external image tooling required); regenerate
  with `npm run icons` if you change the brand colors in `src/config/site.ts`.
