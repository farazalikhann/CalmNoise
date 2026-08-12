// Central site metadata used by the SEO component, layout, and JSON-LD schema.
// `url` must always match astro.config.mjs `site` (the domain root only — the
// /CalmNoise base path is added separately via import.meta.env.BASE_URL /
// Astro.url wherever a full app URL is built, so this stays a single source
// of truth for the two config files).

export const SITE = {
  name: 'CalmNoise',
  title: 'White Noise & Focus Sounds — Free Online Ambient Sound Mixer',
  description:
    'Mix white noise, pink noise, brown noise, rain, thunderstorm, ocean, forest, cafe, fireplace and fan sounds for free. A calming, ad-light sound mixer for focus, study, relaxation, and sleep — runs entirely in your browser, no sign-up required.',
  url: 'https://farazalikhann.github.io',
  twitterHandle: '@calmnoiseapp',
  locale: 'en_US',
  themeColor: '#0a0f1c',
} as const;
