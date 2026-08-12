// ---------------------------------------------------------------------------
// AdSense configuration
// ---------------------------------------------------------------------------
// 1. Sign up for Google AdSense and get your publisher (client) ID.
// 2. Create three ad units in your AdSense dashboard (header banner,
//    below-mixer banner, sidebar) and copy each unit's slot ID here.
// 3. Set ADSENSE_ENABLED to true.
// 4. Add the AdSense loader script to `src/layouts/BaseLayout.astro` (see the
//    commented block near <head> for exactly where it goes).
// ---------------------------------------------------------------------------

// TODO: replace with your real AdSense publisher ID, e.g. "ca-pub-1234567890123456"
export const ADSENSE_CLIENT_ID = 'ca-pub-0000000000000000';

// TODO: replace with real ad unit (slot) IDs from your AdSense dashboard
export const AD_SLOTS = {
  headerBanner: '0000000001',
  belowMixer: '0000000002',
  sidebar: '0000000003',
};

// Flip to true once ADSENSE_CLIENT_ID and AD_SLOTS above are real values.
// While false, AdSlot.astro renders an empty, clearly-marked placeholder box
// instead of attempting to load ads — so the site never ships broken ad calls.
export const ADSENSE_ENABLED = false;
