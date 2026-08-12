// Astro mirrors the configured `base` value into import.meta.env.BASE_URL
// literally, with no guaranteed trailing slash (e.g. base: '/CalmNoise'
// yields BASE_URL === '/CalmNoise', not '/CalmNoise/'). Every internal link,
// asset path, and fetch URL in this project is built by appending a
// path onto this constant, so it's normalized once here rather than risking
// a missing separator (and a broken "/CalmNoiseabout"-style URL) at each of
// the many call sites.
const raw = import.meta.env.BASE_URL;
export const BASE = raw.endsWith('/') ? raw : `${raw}/`;
