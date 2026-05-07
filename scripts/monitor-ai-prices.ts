/**
 * AI tool pricing monitor — weekly cron.
 *
 * Fetches each AI provider's official pricing page, extracts price-bearing
 * text, and diffs against last week's snapshot. When a price/plan changes,
 * commits a snapshot file + writes a fresh-urls.txt entry so IndexNow can
 * push relevant articles for re-crawl.
 *
 * Usage: tsx scripts/monitor-ai-prices.ts
 *
 * Why this matters: Korean users searching "ChatGPT 가격 인상" / "Claude
 * 새 요금제" land on whatever site has the freshest content. Snapshot diffs
 * give us a reliable "we noticed first" signal even when no new article runs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOTS_DIR = path.join(ROOT, '.ai-price-snapshots');

const TARGETS = [
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://www.anthropic.com/pricing',
    relatedSlug: 'chatgpt-korea-payment',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://openai.com/chatgpt/pricing/',
    relatedSlug: 'chatgpt-korea-payment',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://one.google.com/about/google-ai-plans',
    relatedSlug: 'claude-vs-gpt-korea',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    url: 'https://www.cursor.com/pricing',
    relatedSlug: 'claude-vs-gpt-korea',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai/pro',
    relatedSlug: 'chatgpt-korea-payment',
  },
];

const UA = 'Mozilla/5.0 (compatible; AllThatAIRealBot/1.0; +https://allthatai-real.vercel.app)';

/**
 * Reduce raw HTML to a price-fingerprint: only $/USD/원/KRW/% tokens with
 * surrounding context. Filters out navigation chrome / cookie banners /
 * date stamps that change every page load.
 */
function extractPriceFingerprint(html: string): string {
  // Strip script/style/svg blocks (huge + irrelevant)
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  // Strip all tags
  s = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // Find all price-bearing segments (~80 chars context around $X / X원 / X%)
  const matches = s.match(/[^.!?\n]{0,40}\b(?:\$\d+|\d+\s?(?:USD|원|KRW)|\d+%|month|monthly|annually|yearly)\b[^.!?\n]{0,40}/gi);
  if (!matches) return '';
  // Dedupe + normalize + sort for deterministic ordering
  const set = new Set(matches.map((m) => m.trim().toLowerCase()));
  return [...set].sort().join('\n');
}

async function fetchSnapshot(target: typeof TARGETS[number]): Promise<string | null> {
  try {
    const res = await fetch(target.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.warn(`  ${target.id}: HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    return extractPriceFingerprint(html);
  } catch (e) {
    console.warn(`  ${target.id}: ${e instanceof Error ? e.message : 'fetch error'}`);
    return null;
  }
}

async function loadPrevious(id: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(SNAPSHOTS_DIR, `${id}.txt`), 'utf8');
  } catch {
    return null;
  }
}

async function saveSnapshot(id: string, content: string) {
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  await fs.writeFile(path.join(SNAPSHOTS_DIR, `${id}.txt`), content, 'utf8');
}

async function main() {
  console.log(`AI pricing monitor — checking ${TARGETS.length} targets`);
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });

  const changed: string[] = [];
  const refreshUrls: string[] = [];

  for (const t of TARGETS) {
    console.log(`  ${t.id}...`);
    const current = await fetchSnapshot(t);
    if (!current) continue;

    const previous = await loadPrevious(t.id);
    if (previous && previous === current) {
      console.log(`    no change`);
      continue;
    }

    if (previous) {
      changed.push(t.name);
      console.log(`    CHANGED — diff ${Math.abs(current.length - previous.length)} chars`);
    } else {
      console.log(`    first snapshot`);
    }

    await saveSnapshot(t.id, current);

    if (changed.includes(t.name)) {
      refreshUrls.push(`https://allthatai-real.vercel.app/guides/${t.relatedSlug}/`);
    }
  }

  if (changed.length > 0) {
    console.log(`\nDetected price changes: ${changed.join(', ')}`);
    if (refreshUrls.length > 0) {
      const dedupe = [...new Set(refreshUrls)];
      await fs.writeFile(path.join(ROOT, 'fresh-urls.txt'), dedupe.join('\n') + '\n', 'utf8');
      console.log(`fresh-urls.txt: ${dedupe.length} URLs queued for IndexNow`);
    }
  } else {
    console.log('\nNo price changes detected this run.');
  }
}

main().catch((e) => {
  console.error('monitor-ai-prices fatal:', e);
  process.exit(1);
});
