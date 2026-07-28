import type { APIContext } from 'astro';
import { allGuides } from '../data/guides';
import { autoGuides } from '../data/guides.auto';

const SITE = 'https://real.allthatai.kr';

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(_ctx: APIContext) {
  const guideItems = allGuides.map((g) => ({
    title: g.title,
    url: `${SITE}/guides/${g.slug}/`,
    excerpt: g.excerpt,
    tag: g.tag,
    date: new Date().toUTCString(),
  }));
  const autoItems = autoGuides.map((g) => ({
    title: g.title,
    url: `${SITE}/issues/${g.slug}/`,
    excerpt: g.excerpt,
    tag: g.tag,
    date: new Date(g.generatedAt).toUTCString(),
  }));
  const all = [...autoItems, ...guideItems];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AllThatAI Real</title>
    <link>${SITE}/</link>
    <description>한국 인디 / 일반인 도구·할인·정부지원 큐레이션</description>
    <language>ko</language>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    ${all
      .map(
        (it) => `<item>
      <title>${escapeXml(it.title)}</title>
      <link>${it.url}</link>
      <guid isPermaLink="true">${it.url}</guid>
      <description>${escapeXml(it.excerpt)}</description>
      <category>${escapeXml(it.tag)}</category>
      <pubDate>${it.date}</pubDate>
    </item>`
      )
      .join('\n    ')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
