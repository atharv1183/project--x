/**
 * generate-sitemap.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads all blog/city/money/compare slugs from src/data/content/index.ts and
 * writes a fully updated public/sitemap.xml.
 *
 * Usage:
 *   node scripts/generate-sitemap.js          # run once
 *   node scripts/generate-sitemap.js --watch  # re-run on content changes
 *
 * Integrate in package.json:
 *   "prebuild": "node scripts/generate-sitemap.js"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const CONTENT   = path.join(ROOT, 'src', 'data', 'content', 'index.ts');
const SITEMAP   = path.join(ROOT, 'public', 'sitemap.xml');
const BASE_URL  = 'https://estatepluscrm.in';
const TODAY     = new Date().toISOString().split('T')[0];

// ── Static pages ──────────────────────────────────────────────────────────────
const STATIC_PAGES = [
  { loc: '/',                   changefreq: 'weekly',  priority: '1.0' },
  { loc: '/blogs',              changefreq: 'daily',   priority: '0.9' },
  { loc: '/features',           changefreq: 'monthly', priority: '0.8' },
  { loc: '/book-demo',          changefreq: 'monthly', priority: '0.8' },
  { loc: '/get-started',        changefreq: 'monthly', priority: '0.7' },
  // Legal pages
  { loc: '/legal/privacy-policy',       changefreq: 'yearly', priority: '0.4' },
  { loc: '/legal/terms-of-service',     changefreq: 'yearly', priority: '0.4' },
  { loc: '/legal/refund-cancellation',  changefreq: 'yearly', priority: '0.4' },
  { loc: '/legal/cookie-policy',        changefreq: 'yearly', priority: '0.4' },
  { loc: '/legal/disclaimer',           changefreq: 'yearly', priority: '0.4' },
  { loc: '/legal/acceptable-use',       changefreq: 'yearly', priority: '0.4' },
];

// ── Extract slugs from content/index.ts ──────────────────────────────────────
function extractSlugs(source) {
  const entries = [];
  // Match: slug: 'some-slug', ... type: 'blog'
  // We parse all { slug, type } pairs with a simple regex over the raw TS source
  const blockRe = /\{[^{}]*slug\s*:\s*['"`]([^'"`]+)['"`][^{}]*type\s*:\s*['"`]([^'"`]+)['"`][^{}]*\}/gs;
  let match;
  while ((match = blockRe.exec(source)) !== null) {
    entries.push({ slug: match[1], type: match[2] });
  }
  // Also catch reversed order: type first, slug second
  const blockRe2 = /\{[^{}]*type\s*:\s*['"`]([^'"`]+)['"`][^{}]*slug\s*:\s*['"`]([^'"`]+)['"`][^{}]*\}/gs;
  while ((match = blockRe2.exec(source)) !== null) {
    entries.push({ slug: match[2], type: match[1] });
  }
  // Deduplicate
  const seen = new Set();
  return entries.filter(e => {
    const key = `${e.type}/${e.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Priority / changefreq by content type ────────────────────────────────────
function metaForType(type) {
  switch (type) {
    case 'blog':    return { changefreq: 'weekly',  priority: '0.8' };
    case 'city':    return { changefreq: 'monthly', priority: '0.7' };
    case 'compare': return { changefreq: 'monthly', priority: '0.6' };
    case 'money':   return { changefreq: 'monthly', priority: '0.6' };
    default:        return { changefreq: 'monthly', priority: '0.5' };
  }
}

// ── Build XML ─────────────────────────────────────────────────────────────────
function buildSitemap(dynamicEntries) {
  const urls = [];

  // Static pages
  for (const p of STATIC_PAGES) {
    urls.push(`  <url>
    <loc>${BASE_URL}${p.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`);
  }

  // Dynamic content pages
  for (const { slug, type } of dynamicEntries) {
    const { changefreq, priority } = metaForType(type);
    urls.push(`  <url>
    <loc>${BASE_URL}/${type}/${slug}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function generate() {
  const source = fs.readFileSync(CONTENT, 'utf8');
  const entries = extractSlugs(source);
  const xml = buildSitemap(entries);
  fs.writeFileSync(SITEMAP, xml, 'utf8');
  console.log(`[sitemap] ✓ Generated ${STATIC_PAGES.length} static + ${entries.length} dynamic URLs → public/sitemap.xml`);
}

generate();

// ── Optional watch mode ───────────────────────────────────────────────────────
if (process.argv.includes('--watch')) {
  console.log('[sitemap] Watching src/data/content/index.ts for changes…');
  fs.watch(CONTENT, () => {
    console.log('[sitemap] Content changed, regenerating…');
    try { generate(); } catch (e) { console.error('[sitemap] Error:', e.message); }
  });
}
