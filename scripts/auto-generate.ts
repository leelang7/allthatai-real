/**
 * Auto-publisher for trending sensational issues.
 *
 * LLM: Google Gemini (free tier: 1,500 RPD, 15 RPM — easily covers 3-12
 * articles/day). Switching to a paid model later only requires changing
 * `MODEL` + the fetch URL.
 *
 * Pipeline (every 6h via GitHub Actions):
 *   1. Pull trends from Korean RSS sources (YouTube KR + Google Trends KR).
 *   2. Cross-source dedupe + score by appearance count.
 *   3. Filter via blocked-keywords (piracy + manual-curation zone + hard rules).
 *   4. For each surviving candidate, ask Gemini to draft a desk-journalism
 *      style "issue analysis" article. Model is instructed to refuse minors,
 *      defamation-risk speculation, etc.
 *   5. Save to src/pages/issues/<slug>/index.astro and append meta to
 *      src/data/guides.auto.ts.
 *   6. Caller commits + pushes; Vercel auto-deploys.
 *
 * Required env: GEMINI_API_KEY (https://aistudio.google.com/apikey, free).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { allGuides } from '../src/data/guides';
import { BLOCKED_KEYWORDS, BLOCKED_PATTERNS } from './blocked-keywords';

const ROOT = path.resolve(import.meta.dirname, '..');
const ISSUES_DIR = path.join(ROOT, 'src/pages/issues');
const META_FILE = path.join(ROOT, 'src/data/guides.auto.ts');

const MAX_NEW_PER_RUN = parseInt(process.env.MAX_NEW_PER_RUN || '3', 10);
// gemini-2.5-flash-lite: free tier sees ~15 RPM / 1000 RPD / 1M TPM as of mid-2025.
// gemini-2.0-flash often gets stricter rate limits on fresh keys.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const QUOTA_RETRY_DELAY_MS = 60_000;
const QUOTA_MAX_RETRIES = 2;

// Google News RSS by topic — reliable, never rate-limits us, returns 10-100
// recent headlines per call. Headlines work BETTER than bare trend terms because
// they include who/what/where context the LLM can ground on.
const SOURCES = [
  { name: 'google-news-kr-top',     url: 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko' },
  { name: 'google-news-kr-nation',  url: 'https://news.google.com/rss/headlines/section/topic/NATION?hl=ko&gl=KR&ceid=KR:ko' },
  { name: 'google-news-kr-ent',     url: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=ko&gl=KR&ceid=KR:ko' },
  { name: 'google-news-kr-sports',  url: 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=ko&gl=KR&ceid=KR:ko' },
  { name: 'google-news-kr-tech',    url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ko&gl=KR&ceid=KR:ko' },
  { name: 'google-news-kr-biz',     url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko' },
];

interface TrendItem {
  title: string;
  source: string;
  context?: string;
  link?: string;
}

interface GeneratedMeta {
  slug: string;
  title: string;
  excerpt: string;
  tag: string;
  minutes: number;
  generatedAt: string;
  type: 'issue';
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isBlocked(keyword: string): boolean {
  const k = keyword.toLowerCase();
  if (BLOCKED_KEYWORDS.some((b) => k.includes(b.toLowerCase()))) return true;
  return BLOCKED_PATTERNS.some((re) => re.test(keyword));
}

async function fetchSource(src: { name: string; url: string }): Promise<TrendItem[]> {
  try {
    const res = await fetch(src.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AllThatAIRealBot/1.0)' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: TrendItem[] = [];
    const itemRe = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml))) {
      const block = m[1];
      const title = (
        /<title[^>]*>(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?<\/title>/.exec(block)?.[1] || ''
      ).trim();
      const link = (/<link[^>]*>([^<]+)<\/link>/.exec(block)?.[1] || '').trim();
      const context = (
        /<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/.exec(block)?.[1] ||
        /<media:description[^>]*>([\s\S]*?)<\/media:description>/.exec(block)?.[1] ||
        ''
      )
        .replace(/<[^>]+>/g, '')
        .trim()
        .slice(0, 200);
      if (title) items.push({ title, source: src.name, link, context });
    }
    return items;
  } catch (e) {
    console.warn(`source ${src.name} failed:`, e instanceof Error ? e.message : e);
    return [];
  }
}

async function loadExistingSlugs(): Promise<Set<string>> {
  const set = new Set<string>(allGuides.map((g) => g.slug));
  try {
    const autoMeta = await import('../src/data/guides.auto');
    for (const g of (autoMeta as any).autoGuides as GeneratedMeta[]) set.add(g.slug);
  } catch {
    /* file may not exist yet */
  }
  return set;
}

const SYSTEM_PROMPT = `You are a Korean desk-journalism writer for "AllThatAI Real" — a Korean issue
analysis portal. You write CRITICAL, FACT-BASED articles about trending Korean issues
(연예/사회/정치/바이럴) that cite primary news sources only. Never speculate beyond
what is reported.

ABSOLUTE RULES — violating any → respond with the literal string "SKIP_TOPIC" and nothing else:
1. If the topic identifies or could identify a minor (under 19), refuse.
2. If the topic involves an unconfirmed rumor about a private individual that primary
   news outlets (연합뉴스, 뉴시스, SBS, KBS, MBC, 중앙·조선·한겨레·경향) have NOT
   reported, refuse.
3. If the topic invites piracy, illegal advice, fraud, or aids hate speech against
   protected groups (race, gender, religion, disability, sexual orientation), refuse.
4. If you would have to fabricate quotes, statistics, dates, or names to write the
   article, refuse. It's better to skip than to invent.
5. If the trending term is a person's full name with no clear public-interest news
   anchor, refuse.

EDITORIAL FRAME — when you DO write:
- Title: factual + curiosity-driving but never tabloid scream. (60자 이내)
- Lead: one paragraph stating what's happening + why it's trending.
- Sections (use h2):
   - "지금까지 알려진 사실" — bullet timeline citing dates + outlets
   - "양측 입장" — neutrally summarize each side
   - "확인되지 않은 것" — list rumors NOT yet reported, label as such
   - "다음에 볼 것" — what to watch (court date, official response, etc.)
- Use <Callout type="warn|tip|fact|info|danger" title="...">…</Callout> for risk
  warnings and source-checks.
- All numerical / date / name claims must include the outlet that reported it.
- Use neutral language; no "충격" / "경악" / "헉" / "터졌다" tabloid-isms.

Output ONLY a JSON object, no markdown fences, no commentary. Schema:
{
  "tag": one of ["사회 이슈","연예","정치","바이럴","글로벌","스포츠","IT 이슈"],
  "title": "기사 제목 (60자 이내)",
  "description": "메타 설명 (140자 이내)",
  "excerpt": "리스트 카드용 한 줄 (90자 이내)",
  "minutes": int 4-7,
  "sources": "1차 출처 매체 1-3개 (예: 연합뉴스, SBS)",
  "body_md": "Astro 페이지 본문 — 마크다운 + Callout 컴포넌트.\\n첫 단락은 <p class=\\"lead\\">로.\\n각 사실 인용 끝에 (출처: 매체명, 날짜) 표기."
}`;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

async function callGemini(userMsg: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userMsg }] }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  for (let attempt = 0; attempt <= QUOTA_MAX_RETRIES; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!text) {
        console.warn('Gemini empty response, finishReason:', data.candidates?.[0]?.finishReason);
        return null;
      }
      return text;
    }
    const errText = await res.text().catch(() => '');
    // 429 = quota; 503 = overloaded. Both worth retrying with backoff.
    if ((res.status === 429 || res.status === 503) && attempt < QUOTA_MAX_RETRIES) {
      const wait = QUOTA_RETRY_DELAY_MS * (attempt + 1);
      console.warn(`Gemini ${res.status} — waiting ${wait / 1000}s then retrying (${attempt + 1}/${QUOTA_MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    console.warn(`Gemini ${res.status}: ${errText.slice(0, 220)}`);
    return null;
  }
  return null;
}

async function generateArticle(item: TrendItem): Promise<{
  meta: GeneratedMeta;
  fileBody: string;
} | null> {
  const userMsg = `트렌드 키워드: "${item.title}"
출처 채널: ${item.source}
${item.context ? `참고 컨텍스트:\n${item.context}` : ''}
${item.link ? `참고 링크: ${item.link}` : ''}

위 트렌드의 사회 이슈 분석 글을 schema대로 작성. 출처 인용 필수, 추측 금지. JSON만 출력.`;

  const text = await callGemini(userMsg);
  if (!text) return null;

  if (text.trim() === 'SKIP_TOPIC' || text.includes('"SKIP_TOPIC"') || text.includes('SKIP_TOPIC')) {
    console.log(`  [skip] ${item.title} — model declined (safety)`);
    return null;
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log(`  [skip] ${item.title} — no JSON output`);
    return null;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    console.log(`  [skip] ${item.title} — JSON parse error`);
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const slug = `issue-${today}-${slugify(item.title) || Date.now()}`;
  const meta: GeneratedMeta = {
    slug,
    title: parsed.title || item.title,
    excerpt: parsed.excerpt || '',
    tag: parsed.tag || '사회 이슈',
    minutes: parsed.minutes || 5,
    generatedAt: new Date().toISOString(),
    type: 'issue',
  };

  const fileBody = `---
import ArticleLayout from '../../../../layouts/ArticleLayout.astro';
import Callout from '../../../../components/Callout.astro';
---
<ArticleLayout
  title=${JSON.stringify(meta.title)}
  description=${JSON.stringify(parsed.description || '')}
  slug=${JSON.stringify(slug)}
  updated=${JSON.stringify(today)}
  sources=${JSON.stringify(parsed.sources || '')}
>

${parsed.body_md || ''}

</ArticleLayout>
`;
  return { meta, fileBody };
}

async function appendAutoMeta(newMetas: GeneratedMeta[]) {
  let existing: GeneratedMeta[] = [];
  try {
    const mod = await import('../src/data/guides.auto');
    existing = (mod as any).autoGuides || [];
  } catch {
    /* first run */
  }
  const merged = [...newMetas, ...existing];
  const out = `// AUTO-GENERATED — do not edit manually. Updated by scripts/auto-generate.ts.
import type { GuideMeta } from './guides';

export const autoGuides: (GuideMeta & { generatedAt: string; type: 'issue' })[] = ${JSON.stringify(
    merged,
    null,
    2,
  )};
`;
  await fs.writeFile(META_FILE, out, 'utf8');
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY missing');
    process.exit(1);
  }

  console.log('1. Fetching trending items from sources...');
  const allItems: TrendItem[] = [];
  for (const src of SOURCES) {
    const items = await fetchSource(src);
    console.log(`   ${src.name}: ${items.length} items`);
    allItems.push(...items);
  }

  const scoreMap = new Map<string, { item: TrendItem; count: number }>();
  for (const it of allItems) {
    const key = it.title.trim();
    if (!key) continue;
    const cur = scoreMap.get(key);
    if (cur) cur.count++;
    else scoreMap.set(key, { item: it, count: 1 });
  }
  const ranked = [...scoreMap.values()].sort((a, b) => b.count - a.count).map((v) => v.item);
  console.log(`   ${ranked.length} unique trending items`);

  const existing = await loadExistingSlugs();
  const today = new Date().toISOString().slice(0, 10);
  const candidates = ranked
    .filter((t) => !isBlocked(t.title))
    .filter((t) => !existing.has(`issue-${today}-${slugify(t.title)}`))
    .slice(0, MAX_NEW_PER_RUN * 4);

  console.log(`2. ${candidates.length} candidates after filter (blocklist: ${BLOCKED_KEYWORDS.length} terms)`);

  const generated: GeneratedMeta[] = [];
  await fs.mkdir(ISSUES_DIR, { recursive: true });

  for (const cand of candidates) {
    if (generated.length >= MAX_NEW_PER_RUN) break;
    console.log(`3. Generating: ${cand.title}`);
    try {
      const result = await generateArticle(cand);
      if (!result) continue;
      const slugDir = path.join(ISSUES_DIR, result.meta.slug);
      await fs.mkdir(slugDir, { recursive: true });
      await fs.writeFile(path.join(slugDir, 'index.astro'), result.fileBody, 'utf8');
      generated.push(result.meta);
      console.log(`   wrote ${result.meta.slug}`);
    } catch (e) {
      console.error(`   error on "${cand.title}":`, e instanceof Error ? e.message : e);
    }
  }

  if (generated.length > 0) {
    await appendAutoMeta(generated);
    console.log(`4. Appended ${generated.length} entries to guides.auto.ts`);
  } else {
    console.log('4. Nothing new generated this run');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
