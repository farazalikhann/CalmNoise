import type { APIRoute } from 'astro';
import { SITE } from '../config/site';
import { BASE as base } from '../utils/base';

export const GET: APIRoute = () => {
  const sitemapURL = new URL(`${base}sitemap-index.xml`, SITE.url).toString();
  const body = `User-agent: *\nAllow: ${base}\n\nSitemap: ${sitemapURL}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
