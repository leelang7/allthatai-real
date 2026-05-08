/**
 * Daily tracker updater.
 *
 * For each tracker in src/data/trackers.ts:
 *   1. Fetch Google News RSS for the query
 *   2. Parse items, dedupe by hash, sort newest first
 *   3. Merge with existing live items (keep last 50)
 *   4. Rewrite src/data/trackers.live.ts
 *
 * Exits 0 even on partial failure so cron commits whatever was successful.
 * Caller (workflow) commits + pushes + IndexNow-pings updated tracker URLs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { trackers } from '../src/data/trackers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_FILE = path.join(ROOT, 'src/data/trackers.live.ts');
const FRESH_URLS = path.join(ROOT, 'fresh-urls.txt');
const SITE = 'https://allthatai-real.vercel.app';
const UA = 'Mozilla/5.0 (compatible; AllThatAIRealBot/1.0; +https://allthatai-real.vercel.app)';
const MAX_ITEMS = 50;

interface TrackerItem {
  title: string;
  link: string;
  source?: string;
  pubDate: string;
  id: string;
}

function hash(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

async function fetchGoogleNews(query: string): Promise<TrackerItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.warn(`  Google News ${res.status} for "${query}"`);
      return [];
    }
    const xml = await res.text();
    const items: TrackerItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || '';
      const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || '';
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || new Date().toUTCString();
      const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim();
      if (!title || !link) continue;
      items.push({
        title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        link,
        source,
        pubDate: new Date(pubDate).toISOString(),
        id: hash(title + link),
      });
    }
    return items;
  } catch (e) {
    console.warn(`  Google News fetch failed for "${query}":`, e instanceof Error ? e.message : e);
    return [];
  }
}

async function loadExisting(): Promise<Record<string, { lastUpdated: string; items: TrackerItem[] }>> {
  try {
    const mod = await import('../src/data/trackers.live');
    return (mod as any).trackerLive || {};
  } catch {
    return {};
  }
}

async function main() {
  console.log(`Updating ${trackers.length} tracker(s)...`);

  const existing = await loadExisting();
  const out: typeof existing = {};
  const refreshUrls: string[] = [];

  for (const t of trackers) {
    console.log(`  ${t.slug}: query="${t.query}"`);
    const fetched = await fetchGoogleNews(t.query);
    console.log(`    fetched ${fetched.length} items`);

    const prev = existing[t.slug] || { lastUpdated: '', items: [] };
    const seen = new Set(prev.items.map((i) => i.id));
    const newItems = fetched.filter((i) => !seen.has(i.id));
    console.log(`    ${newItems.length} new`);

    // Merge: new items first, then old, capped at MAX_ITEMS
    const merged = [...newItems, ...prev.items]
      .sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1))
      .slice(0, MAX_ITEMS);

    out[t.slug] = {
      lastUpdated: new Date().toISOString(),
      items: merged,
    };

    if (newItems.length > 0) {
      refreshUrls.push(`${SITE}/trackers/${t.slug}/`);
    }
  }

  // Write live file
  const body = `/**
 * AUTO-GENERATED — do not edit. Updated by scripts/update-trackers.ts (daily cron).
 */

export interface TrackerItem {
  title: string;
  link: string;
  source?: string;
  pubDate: string;
  id: string;
}

export type TrackerLive = Record<string, {
  lastUpdated: string;
  items: TrackerItem[];
}>;

export const trackerLive: TrackerLive = ${JSON.stringify(out, null, 2)};
`;
  await fs.writeFile(LIVE_FILE, body, 'utf8');
  console.log(`Wrote ${LIVE_FILE}`);

  // IndexNow refresh queue
  if (refreshUrls.length > 0) {
    const dedupe = [...new Set(refreshUrls)];
    await fs.writeFile(FRESH_URLS, dedupe.join('\n') + '\n', 'utf8');
    console.log(`fresh-urls.txt: ${dedupe.length} URLs queued for IndexNow`);
  } else {
    console.log('No tracker updates this run.');
  }
}

main().catch((e) => {
  console.error('update-trackers fatal:', e);
  process.exit(0);
});
