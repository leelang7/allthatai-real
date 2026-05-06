/**
 * Auto-publisher for deals / discounts / promotions.
 *
 * Editorial pivot: Real readers don't go to a niche portal to read news. They
 * go to find concrete savings. So this script seeds the LLM with current deal
 * candidates from sources that surface ACTUAL ongoing promotions, and asks
 * Claude/Gemini to write affiliate-friendly comparison/recommendation pieces.
 *
 * Pipeline (every 6h via GitHub Actions):
 *   1. Pull deal candidates from:
 *        - Reddit r/GameDeals top of day (free, JSON)
 *        - Reddit r/buildapcsales top of day
 *        - YouTube search RSS for Korean deal keywords (free, no key)
 *        - Evergreen seed topics (rotating, never stops feeding the engine)
 *   2. Filter via blocked-keywords (piracy + manual-curation zone).
 *   3. For each candidate (capped MAX_NEW_PER_RUN), ask Gemini to write a
 *      deal-curation article in one of these formats:
 *        - "이번 주 [카테고리] 핫딜 N선" (listicle)
 *        - "[제품] vs [경쟁제품] 가격·혜택 비교" (comparison)
 *        - "[프로모션] 어떻게 받나" (how-to)
 *      Each article ends with a clear CTA and never invents prices it can't
 *      verify.
 *   4. Save to src/pages/issues/<slug>/index.astro and append meta to
 *      src/data/guides.auto.ts.
 *   5. Caller commits + pushes; Vercel auto-deploys.
 *
 * Required env: GEMINI_API_KEY (free at https://aistudio.google.com/apikey).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { allGuides } from '../src/data/guides';
import { BLOCKED_KEYWORDS, BLOCKED_PATTERNS } from './blocked-keywords';

const ROOT = path.resolve(import.meta.dirname, '..');
const ISSUES_DIR = path.join(ROOT, 'src/pages/issues');
const META_FILE = path.join(ROOT, 'src/data/guides.auto.ts');

const MAX_NEW_PER_RUN = parseInt(process.env.MAX_NEW_PER_RUN || '3', 10);
// flash-lite: free tier ~1,000 RPD vs flash 250 RPD. Same Korean quality for our use.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const QUOTA_RETRY_DELAY_MS = 30_000;
const QUOTA_MAX_RETRIES = 1;
// Once daily quota is exhausted, retrying inside the same run only burns time.
// We flip this and short-circuit the rest of the candidates.
let QUOTA_EXHAUSTED = false;

const UA =
  'Mozilla/5.0 (compatible; AllThatAIRealBot/1.0; +https://real.allthatai.kr)';

// === Live deal sources (free, no auth) ===
const REDDIT_DEAL_FEEDS = [
  // Reddit JSON: top of day, biggest deal subreddits
  'https://www.reddit.com/r/GameDeals/top.json?t=day&limit=25',
  'https://www.reddit.com/r/buildapcsales/top.json?t=day&limit=15',
  'https://www.reddit.com/r/AppHookup/top.json?t=week&limit=15', // mobile app deals
  'https://www.reddit.com/r/SteamDeals/top.json?t=day&limit=10',
];

// YouTube search RSS — title-only, no API key needed.
// Korean deal-hunter keywords with strong commercial intent.
const YT_KEYWORDS = [
  '클로드 할인',
  'chatgpt 프로모션',
  '스팀 세일',
  '에픽 무료게임',
  '트래블월렛 혜택',
  '쿠팡플레이 할인',
  '디즈니플러스 할인',
  '플레이스테이션 세일',
  '닌텐도 세일',
  'AI 도구 할인',
  'cursor 할인',
  '청년 지원금',
  '신용카드 캐시백',
  '항공권 특가',
  '직구 꿀템',
];

// Google News topic feeds — broader Korean trend signal that we cross-reference
// to bias category routing on the LLM call.
const GOOGLE_NEWS_TOPICS = [
  { url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ko&gl=KR&ceid=KR:ko', tagHint: 'AI 도구' },
  { url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko', tagHint: '카드/핀테크' },
];

// Evergreen seed topics. The cron rotates through these so the engine never
// idles even on weekends when news / Reddit are quiet. Each seed is phrased
// as something a Korean deal-hunter would actually Google.
const EVERGREEN_SEEDS = [
  '클로드 Pro 할인 받는 법 — 학생·연간결제·프로모션',
  'ChatGPT Plus vs Claude Pro vs Gemini Advanced 가격 차이',
  'Cursor IDE 무료 한도와 Pro $20 결제 시점',
  '스팀 큰 세일 일정 모음 (여름·겨울·할로윈·프라임데이)',
  'Epic Games 무료게임 받는 법 + 이번 주 무료 정리',
  '플레이스테이션 PSN 세일 잘 사는 시기',
  '트래블월렛 vs 트래블로그 vs Wise 비교 — 해외결제 어느 게 싼가',
  '카카오뱅크 신규가입 캐시백 + 토스뱅크 비교',
  '쿠팡 와우 ₩7,890으로 OTT 무료 + 로켓배송 경제성',
  '디즈니플러스 연간 vs 월간 결제 차이 + 프로모션 코드',
  '넷플릭스 가족 추가 멤버 분담 ₩5,000',
  'Steam Deck vs ROG Ally vs Lenovo Legion Go 가격 비교',
  '에어비앤비 vs 호텔 가격 비교 — 한국에서 출국 시',
  '저가항공 진에어·제주항공·티웨이 프로모션 잡는 법',
  '11번가·쿠팡·G마켓 직구 가격차 — 같은 상품 어디가 싼가',
  '블랙프라이데이 vs 11.11 vs 박싱데이 — 같은 제품 어디가 더 쌌나',
  '한국에서 GPU 살 때 다나와 vs 컴파인 vs 컴퓨존 가격차',
  'NordVPN 1년 vs 2년 결제 — 어느 시점이 가장 싼가',
  'Microsoft 365 한국 vs 학생 라이선스 가격',
  'Adobe Creative Cloud 한국 vs 외국 가격 차이',
  'Notion 학생 무료 — 자격·신청법',
  'Figma 학생 무료 vs Pro 차이',
  'GitHub Pro 학생 무료 패키지에 뭐 들어있나',
  'AWS 무료 12개월 가입 시 주의할 청구',
  'Cloudflare 무료 한도 vs 가비아 vs Vercel 비교',
  '한국에서 결제 가능한 AI 챗봇 카드 — 거부율 비교',

  // 주택 / 청약 / 부동산 — high-search-volume Korean evergreen
  '주택청약종합저축 — 가입 시점·월 납입금·당첨 가점 계산',
  '청년 주택드림 청약통장 vs 일반 주택청약 — 차이와 갈아타기',
  '특별공급 vs 일반공급 — 신혼·생애최초·다자녀·노부모부양 자격',
  '공공분양 vs 민간분양 — 가점 계산법과 당첨 확률 차이',
  '신혼부부 특별공급 소득기준·자산기준 — 2025 최신 기준',
  '생애최초 특별공급 — 자격 조건과 당첨 후 의무거주',
  '청년 월세 한시 특별지원 — 월 20만원 12개월, 신청법',
  '버팀목 전세자금대출 vs 청년 버팀목 — 한도·금리·자격',
  '디딤돌 대출 — 금리·한도·자격과 보금자리론과 비교',
  '신생아 특례 디딤돌 — 1.6% 금리, 자격과 한도',
  '청년 주택드림 대출 — 분양가 80%, 최저 2.2% 금리 조건',
  'LH·SH 행복주택 vs 매입임대 vs 전세임대 — 자격 차이',
  '청약가점제 — 무주택기간·부양가족·통장가입기간 가점 계산',
  '특별공급 추첨제 vs 가점제 — 어느 게 유리한가 (2025 개편)',
  '오피스텔 청약 vs 아파트 청약 — 세금·전매·주거기준 비교',
  '재개발·재건축 분양권 — 일반분양 청약과의 차이',
  '무순위 청약(줍줍) — 자격·당첨 후 절차',
  '주택임대차계약 신고제 — 위반 과태료, 면제 조건',
  '전세 사기 피해 지원 — 특별법 신청 자격과 절차',
  '취득세 감면 — 생애최초·신혼·중과 면제 조건 정리',
  '양도소득세 1세대1주택 비과세 — 보유 2년·거주 2년 요건',
  '종합부동산세 — 1주택자 공제·합산 배제',
  '주거급여 — 임차가구 지원 한도와 신청 절차',
];

interface DealCandidate {
  title: string;
  source: string;
  context?: string;
  link?: string;
  evergreen?: boolean;
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

async function fetchReddit(url: string): Promise<DealCandidate[]> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const posts = json?.data?.children ?? [];
    return posts.map((p: any) => ({
      title: p.data.title || '',
      source: `reddit:${url.match(/r\/([^/]+)/)?.[1] || 'unknown'}`,
      context: (p.data.selftext || '').slice(0, 300),
      link: `https://reddit.com${p.data.permalink}`,
    }));
  } catch (e) {
    console.warn('reddit fetch failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

async function fetchYouTubeKeyword(kw: string): Promise<DealCandidate[]> {
  // YouTube exposes a feed for any search query at this URL.
  const url = `https://www.youtube.com/feeds/videos.xml?search_query=${encodeURIComponent(kw)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: DealCandidate[] = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml))) {
      const block = m[1];
      const title = (
        /<title[^>]*>(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?<\/title>/.exec(block)?.[1] || ''
      ).trim();
      const link = (/<link[^>]+href="([^"]+)"/.exec(block)?.[1] || '').trim();
      const ctx = (
        /<media:description[^>]*>([\s\S]*?)<\/media:description>/.exec(block)?.[1] || ''
      )
        .replace(/<[^>]+>/g, '')
        .trim()
        .slice(0, 200);
      if (title) items.push({ title, source: `yt:${kw}`, context: ctx, link });
      if (items.length >= 5) break;
    }
    return items;
  } catch (e) {
    console.warn(`yt fetch ${kw} failed:`, e instanceof Error ? e.message : e);
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

const SYSTEM_PROMPT = `You are a Korean deal-curation writer for "AllThatAI Real" — a portal that helps
readers find ACTUAL savings. You write practical, comparison-focused articles
about deals, discounts, promotions, and student / new-user benefits.

UNCERTAIN PRICE/DATA POLICY — DO NOT REFUSE FOR THIS REASON:
- If you don't know a current exact price/percentage/date, write the LABEL with
  "(공식 사이트 확인 필요)" placeholder and continue writing. NEVER skip the
  topic just because some specifics are unknown — readers can click through.
- You DO know structural facts (Netflix HAS plans, Steam HAS seasonal sales,
  Cursor IS subscription, etc.). Write those confidently. Only mark unknowns.

ABSOLUTE REFUSAL RULES — violate → respond with literal "SKIP_TOPIC":
1. Refuse if topic invites piracy, account-sharing schemes that violate ToS,
   illegal grey-market activity, or financial scams.
2. Refuse if topic is celebrity gossip, defamation-prone individual news,
   or political controversy. Stick to commercial deal content.
3. Refuse if topic identifies a minor or shares personal info.
4. Refuse only if the topic is fundamentally outside commerce/savings (e.g.
   pure news event with no shopping angle).

EDITORIAL FRAME — when you DO write:
- Pick ONE of these article types based on what the keyword fits:
   • LISTICLE: "이번 주 [카테고리] 핫딜 N선" — 3-5 specific deals
   • COMPARISON: "[제품] vs [경쟁제품] — 어느 게 싼가" — head-to-head table
   • HOW-TO: "[프로모션·할인] 받는 법" — step-by-step
   • TIMING GUIDE: "[제품] 언제 사야 가장 싼가" — sale calendar
- Title: clear value promise + number/comparison if possible. (60자 이내)
- Lead: one paragraph with the BOTTOM LINE (best deal / who should buy / when).
- Sections (h2): use 2-4 of these depending on type:
   • "현재 진행 중인 할인" — list real ongoing deals (cite source if possible)
   • "가격 비교표" — markdown table
   • "이렇게 받는 법" — numbered steps
   • "주의할 점" — small print, hidden fees, ToS risks
   • "다음 세일은 언제" — calendar
- Use <Callout type="tip|warn|fact|info|danger" title="...">…</Callout> for
  hot tips and price-trap warnings.
- End with a short conclusion (1-2 sentences): WHO this deal is for, when to act.
- Tone: friendly, practical, slightly skeptical of marketing claims. NOT clickbait.
- Use neutral language; no "충격" / "헉" / "터졌다" tabloid-isms.

Output ONLY a JSON object, no markdown fences, no commentary. Schema:
{
  "tag": one of ["게임할인","AI 도구","카드/핀테크","OTT","직구/쇼핑","항공/여행","소프트웨어","Steam","주택/청약","정부지원"],
  "title": "기사 제목 (60자 이내)",
  "description": "메타 설명 (140자 이내)",
  "excerpt": "리스트 카드용 한 줄 (90자 이내)",
  "minutes": int 4-7,
  "sources": "참고한 출처 1-3개 (예: Reddit r/GameDeals, Steam, 토스뱅크 공식)",
  "body_md": "Astro 페이지 본문 — 마크다운 + Callout 컴포넌트.\\n첫 단락은 <p class=\\"lead\\">로.\\n표는 마크다운 표 사용."
}`;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

async function callGemini(userMsg: string): Promise<string | null> {
  if (QUOTA_EXHAUSTED) return null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userMsg }] }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 2048,
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
    // Daily quota exhausted: don't burn through more candidates on this run.
    if (res.status === 429 && /exceeded your current quota|GenerateRequestsPerDayPerProjectPerModel/i.test(errText)) {
      console.warn(`Gemini daily quota exhausted — aborting remaining candidates for this run.`);
      QUOTA_EXHAUSTED = true;
      return null;
    }
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

async function generateArticle(item: DealCandidate): Promise<{
  meta: GeneratedMeta;
  fileBody: string;
} | null> {
  const userMsg = `토픽: "${item.title}"
출처: ${item.source}
${item.context ? `참고 컨텍스트:\n${item.context}` : ''}
${item.link ? `참고 링크: ${item.link}` : ''}

위 토픽으로 한국 사용자에게 실제 절약·할인 기회를 알려주는 글을 schema대로 작성.
가격·날짜·할인율을 모르면 "(공식 사이트 확인 필요)"로 적고, 추측 절대 금지. JSON만 출력.`;

  const text = await callGemini(userMsg);
  if (!text) return null;

  if (text.trim() === 'SKIP_TOPIC' || text.includes('"SKIP_TOPIC"')) {
    console.log(`  [skip] ${item.title} — model declined`);
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
  const slug = `deal-${today}-${slugify(item.title) || Date.now()}`;
  const meta: GeneratedMeta = {
    slug,
    title: parsed.title || item.title,
    excerpt: parsed.excerpt || '',
    tag: parsed.tag || 'AI 도구',
    minutes: parsed.minutes || 5,
    generatedAt: new Date().toISOString(),
    type: 'issue',
  };

  const fileBody = `---
import ArticleLayout from '../../../layouts/ArticleLayout.astro';
import Callout from '../../../components/Callout.astro';
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

function pickEvergreen(count: number): DealCandidate[] {
  // Rotate the seed list by current epoch / 6h slot so each cron run feeds
  // different seeds, eventually cycling through all of them.
  const slot = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  const start = slot % EVERGREEN_SEEDS.length;
  const out: DealCandidate[] = [];
  for (let i = 0; i < count; i++) {
    const seed = EVERGREEN_SEEDS[(start + i) % EVERGREEN_SEEDS.length];
    out.push({ title: seed, source: 'evergreen', evergreen: true });
  }
  return out;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY missing');
    process.exit(1);
  }

  console.log('1. Fetching deal candidates...');
  const allItems: DealCandidate[] = [];

  // Evergreen seeds FIRST — Korea-targeted, guaranteed-relevant topics. These
  // form the backbone so we never have a zero-article run, and rotate so the
  // engine eventually covers all 26 seeds.
  const evergreen = pickEvergreen(MAX_NEW_PER_RUN * 3);
  allItems.push(...evergreen);
  console.log(`   evergreen seeds (priority): ${evergreen.length}`);

  // Reddit — supplemental. Filtered to keywords likely to be relevant to a
  // Korean reader (global digital products, Steam, Epic, etc.). US-only
  // physical-store deals (Walmart, Target...) get dropped before LLM call.
  const koreaRelevant = /steam|epic|origin|playstation|nintendo|switch|xbox|microsoft|adobe|figma|notion|github|cursor|chatgpt|claude|gemini|midjourney|netflix|disney|spotify|youtube/i;
  for (const url of REDDIT_DEAL_FEEDS) {
    const items = await fetchReddit(url);
    const filtered = items.filter((it) => koreaRelevant.test(it.title));
    console.log(`   ${url.split('?')[0].split('/r/')[1]}: ${items.length} → ${filtered.length} korea-relevant`);
    allItems.push(...filtered);
  }

  // YouTube search RSS is unreliable (returns 400 on many Korean queries).
  // Skipped for now; evergreen + Reddit cover content needs.

  const existing = await loadExistingSlugs();
  const today = new Date().toISOString().slice(0, 10);
  const candidates = allItems
    .filter((t) => !isBlocked(t.title))
    .filter((t) => !existing.has(`deal-${today}-${slugify(t.title)}`))
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
