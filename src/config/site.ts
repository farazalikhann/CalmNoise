// Central site metadata used by the SEO component, layout, and JSON-LD schema.
// Update SITE_URL to match astro.config.mjs `site` before deploying.

export const SITE = {
  name: 'CalmNoise',
  title: 'White Noise & Focus Sounds — Free Online Ambient Sound Mixer',
  description:
    'Mix white noise, pink noise, brown noise, rain, thunderstorm, ocean, forest, cafe, fireplace and fan sounds for free. A calming, ad-light sound mixer for focus, study, relaxation, and sleep — runs entirely in your browser, no sign-up required.',
  url: 'https://www.calmnoise.app',
  twitterHandle: '@calmnoiseapp',
  locale: 'en_US',
  themeColor: '#0a0f1c',
} as const;
