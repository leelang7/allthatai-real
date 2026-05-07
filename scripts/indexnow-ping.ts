/**
 * IndexNow auto-submitter — fully automated, zero user setup.
 *
 * Submits newly-created article URLs to Bing, Yandex, Seznam (and any other
 * IndexNow-compatible engine) via a single POST to the IndexNow API. Each
 * search engine then crawls the URLs within minutes.
 *
 * Why automated: IndexNow is the only crawler-submission protocol that
 * doesn't require OAuth or per-engine API keys. Just publish a key file in
 * public/ and POST URLs.
 *
 * Triggered from GitHub Actions after auto-generate.ts publishes new posts.
 *   tsx scripts/indexnow-ping.ts <url1> <url2> ...
 *
 * Or read URLs from stdin (newline-separated).
 */

const KEY = '390aa9c078c4d60d88fd24f8f90ae5b4';
const HOST = 'allthatai-real.vercel.app';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

async function pingIndexNow(urls: string[]) {
  if (urls.length === 0) {
    console.log('IndexNow: no URLs to submit.');
    return;
  }

  const body = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };

  // IndexNow's main endpoint cascades to all participating engines.
  const endpoints = [
    'https://api.indexnow.org/IndexNow',
    'https://www.bing.com/indexnow',
  ];

  for (const ep of endpoints) {
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
  let urls: string[] = process.argv.slice(2);

  // Also accept stdin
  if (urls.length === 0 && !process.stdin.isTTY) {
    const chunks: string[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk.toString());
    }
    urls = chunks
      .join('')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  // Dedupe + ensure absolute URLs
  const normalized = [...new Set(urls.map((u) =>
    u.startsWith('http') ? u : `https://${HOST}${u.startsWith('/') ? '' : '/'}${u}`
  ))];

  console.log(`IndexNow submitting ${normalized.length} URL(s):`);
  normalized.forEach((u) => console.log('  -', u));

  await pingIndexNow(normalized);
}

main().catch((e) => {
  console.error('IndexNow ping fatal:', e);
  process.exit(0); // never block the parent workflow
});
