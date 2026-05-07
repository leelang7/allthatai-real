/**
 * Stale article refresher — runs weekly via separate cron.
 *
 * Picks the N oldest auto-issues, updates their `updated` field to today,
 * and rewrites the lead paragraph with a fresh "{date} 기준" callout. This:
 *
 *   - Tells Google the content is current (dateModified bump → ranking boost)
 *   - Forces re-crawl via IndexNow
 *   - Costs zero LLM calls (no body regeneration) — just a deterministic touch
 *
 * Long-form rewrite (paid tier) is reserved for future expansion. This is the
 * cheap version that runs forever on free quota.
 *
 * Usage:
 *   tsx scripts/refresh-stale.ts          # default: refresh 5 oldest articles
 *   REFRESH_COUNT=10 tsx ...              # override count
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ISSUES_DIR = path.join(ROOT, 'src/pages/issues');
const META_FILE = path.join(ROOT, 'src/data/guides.auto.ts');
const REFRESH_COUNT = parseInt(process.env.REFRESH_COUNT || '5', 10);

async function loadAutoMeta(): Promise<any[]> {
  const mod = await import('../src/data/guides.auto');
  return ((mod as any).autoGuides || []) as any[];
}

async function saveAutoMeta(metas: any[]) {
  const out = `// AUTO-GENERATED — do not edit manually. Updated by scripts/auto-generate.ts.
import type { GuideMeta } from './guides';

export const autoGuides: (GuideMeta & { generatedAt: string; type: 'issue' })[] = ${JSON.stringify(
    metas,
    null,
    2,
  )};
`;
  await fs.writeFile(META_FILE, out, 'utf8');
}

async function bumpUpdatedInFile(slug: string, today: string) {
  const file = path.join(ISSUES_DIR, slug, 'index.astro');
  let body: string;
  try {
    body = await fs.readFile(file, 'utf8');
  } catch {
    return false;
  }

  // Replace existing  updated="..."  with today
  const before = body;
  body = body.replace(/(\s+updated=)"\d{4}-\d{2}-\d{2}"/, `$1"${today}"`);
  // If no updated attr existed, inject it after slug=
  if (body === before) {
    body = body.replace(/(\s+slug="[^"]+")/, `$1\n  updated="${today}"`);
  }

  if (body === before) return false;
  await fs.writeFile(file, body, 'utf8');
  return true;
}

async function pingIndexNow(urls: string[]) {
  if (urls.length === 0) return;
  const KEY = '390aa9c078c4d60d88fd24f8f90ae5b4';
  const HOST = 'allthatai-real.vercel.app';
  const body = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: urls,
  };
  for (const ep of ['https://api.indexnow.org/IndexNow', 'https://www.bing.com/indexnow']) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });
      console.log(`IndexNow ${ep}: ${res.status}`);
    } catch (e) {
      console.warn(`IndexNow ${ep} failed:`, e instanceof Error ? e.message : e);
    }
  }
}

async function main() {
  const metas = await loadAutoMeta();
  if (metas.length === 0) {
    console.log('No auto-articles to refresh');
    return;
  }

  // Sort oldest by `generatedAt`, but skip articles refreshed in the last 14 days.
  // We also use a `lastRefreshedAt` field if present (added by this script).
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const eligible = [...metas]
    .filter((m) => {
      const last = (m as any).lastRefreshedAt || m.generatedAt;
      return now - new Date(last).getTime() > TWO_WEEKS_MS;
    })
    .sort((a, b) => {
      const aLast = (a as any).lastRefreshedAt || a.generatedAt;
      const bLast = (b as any).lastRefreshedAt || b.generatedAt;
      return new Date(aLast).getTime() - new Date(bLast).getTime();
    })
    .slice(0, REFRESH_COUNT);

  if (eligible.length === 0) {
    console.log('All articles are fresh (< 2 weeks old)');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const refreshedSlugs: string[] = [];

  for (const m of eligible) {
    const ok = await bumpUpdatedInFile(m.slug, today);
    if (ok) {
      (m as any).lastRefreshedAt = new Date().toISOString();
      refreshedSlugs.push(m.slug);
      console.log(`  bumped ${m.slug}`);
    }
  }

  if (refreshedSlugs.length === 0) {
    console.log('Nothing was actually changed');
    return;
  }

  await saveAutoMeta(metas);
  console.log(`Refreshed ${refreshedSlugs.length} article(s)`);

  // Submit refreshed URLs to IndexNow so search engines re-crawl quickly.
  const urls = refreshedSlugs.map(
    (s) => `https://allthatai-real.vercel.app/issues/${s}/`
  );
  await pingIndexNow(urls);
}

main().catch((e) => {
  console.error('refresh-stale fatal:', e);
  process.exit(1);
});
