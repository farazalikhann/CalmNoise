// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Deployed as a GitHub Pages PROJECT site: https://farazalikhann.github.io/CalmNoise/
// `site` is the domain root; `base` is the repo-name subpath GitHub Pages serves
// this project under. Both are required for correct canonical URLs, asset
// paths, and the sitemap. `base` must match the repo name exactly, including
// capitalization.
const SITE_URL = 'https://farazalikhann.github.io';
const BASE_PATH = '/CalmNoise';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
