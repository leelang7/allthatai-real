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

// Multi-key rotation: each free Gemini API key gets its own daily RPD quota.
// Adding GEMINI_API_KEY_2 / _3 in GH secrets multiplies effective output.
// When key N gets quota-exhausted, we mark it and rotate to N+1 transparently.
const API_KEYS: string[] = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter((k): k is string => !!k);
const EXHAUSTED_KEYS = new Set<number>();
let CURRENT_KEY_IDX = 0;

// True once ALL configured keys are exhausted. We keep generating without LLM
// calls (skipping topics) instead of hard-aborting, so the workflow still
// commits any prior successful generations.
let QUOTA_EXHAUSTED = false;

function getActiveKey(): string | null {
  // Find next non-exhausted key starting from CURRENT_KEY_IDX
  for (let i = 0; i < API_KEYS.length; i++) {
    const idx = (CURRENT_KEY_IDX + i) % API_KEYS.length;
    if (!EXHAUSTED_KEYS.has(idx)) {
      CURRENT_KEY_IDX = idx;
      return API_KEYS[idx];
    }
  }
  QUOTA_EXHAUSTED = true;
  return null;
}

function markCurrentKeyExhausted() {
  EXHAUSTED_KEYS.add(CURRENT_KEY_IDX);
  console.warn(
    `   [quota] Key #${CURRENT_KEY_IDX + 1} exhausted ` +
    `(${EXHAUSTED_KEYS.size}/${API_KEYS.length} keys down)`,
  );
}

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

// Korean government / 청년정책 RSS feeds — automatic 정부지원 idea injection.
// Each feed is parsed for Korean policy/grant headlines that turn into
// "이 지원금 받는 법" articles. No API key required.
const GOV_RSS_FEEDS = [
  {
    url: 'https://www.gov.kr/portal/ntnadmNews/rss',
    tagHint: '정부지원',
    name: '정부24',
  },
  {
    url: 'https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifNewList.rss',
    tagHint: '정부지원',
    name: '청년정책',
  },
];

async function fetchGovRss(feed: { url: string; tagHint: string; name: string }): Promise<DealCandidate[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,application/xml,text/xml' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: DealCandidate[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null && items.length < 5) {
      const title = m[1].match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/)?.[1]?.trim();
      const link = m[1].match(/<link>([^<]+)<\/link>/)?.[1]?.trim();
      const desc = m[1].match(/<description>(?:<!\[CDATA\[)?([^<\]]+)/)?.[1]?.trim();
      if (!title) continue;
      // Korean policy/grant detection — only items with money/support keywords
      if (!/지원|혜택|급여|장학|보조|면제|환급|할인|지원금/.test(title)) continue;
      items.push({
        title: `${title} — 신청 자격·절차`,
        source: `gov:${feed.name}`,
        context: desc?.slice(0, 300) || '',
        link,
      });
    }
    return items;
  } catch (e) {
    console.warn(`gov rss ${feed.name} failed:`, e instanceof Error ? e.message : e);
    return [];
  }
}

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

  // 대행 함정 시리즈 — high commercial intent, low competition.
  // 각 시드는 "X 대행 vs 직접" 정직 비교로 검색어 가로채는 패턴.
  'NICE D&B DUNS 발급 대행 ₩10만 vs 본사 직접 ₩0',
  '사업자등록 대행 vs 홈택스 직접 — 진짜 절차 30분',
  '통신판매업 신고 대행 ₩5만 vs 정부24 직접',
  '특허출원 대행 ₩50만 vs 변리사 직접 vs 자가출원',
  '상표출원 대행 ₩30만 vs 키프리스 직접',
  '법인 설립 대행 ₩30–80만 vs 직접 — 함정과 차이',
  'Apple Developer 등록 대행 vs 직접 ($99/년 그대로)',
  '구글 플레이 콘솔 가입 대행 vs 직접 ($25 1회)',
  '결제대금예치 면제 대행 vs 통신판매업 면제 직접',
  '쇼핑몰 사업자 등록 대행 vs 본인 직접 절차',
  '간이과세자 vs 일반과세자 — 세무사 없이 결정',
  '부가세 신고 세무사 ₩30만/회 vs 홈택스 직접',
  '종합소득세 신고 대행 vs 홈택스 — 매출 5천만 미만',
  '사업자 통장 분리 + 가맹점 신청 — 셀프 가이드',
  '신용카드 단말기 — 직접 계약 vs 대행 (페이먼츠社 비교)',
  'PG사 직접 가입 vs 대행 — 토스페이먼츠/이니시스/KG이니시스',
  '직구 관세 대행 vs UNI-PASS 직접 — 한도·납부',
  '해외 직접투자 신고 — 외환 대행 vs 외국환은행 직접',

  // 전세사기 — 매우 큰 검색량, 광고 단가 큼
  '전세사기 자가 진단 — 등기부등본·시세·임대인 5분 체크',
  '깡통전세 신호 — 보증금 vs 시세 80% 초과 시 대응',
  '신탁등기 전세 — 한국토지신탁·아시아신탁 명의 위험',
  '전세보증보험 HUG vs SGI — 어느 게 본인에게 유리한가',
  '전세사기 특별법 신청 자격·절차·받는 지원 한도',
  '확정일자 + 전입신고 — 잔금 당일 30분 안에 해야 하는 이유',
  '근저당설정 있는 집 전세 — 안전한 비율 계산',
  '임대인 사업자등록 진위 — 홈택스 + 사업자번호 체크섬',
  '대리인 계약 — 위임장·인감증명 진위 확인 4단계',
  '잔금일 등기부등본 재발급 — 0원 vs ₩700 차이',
  '다중 전세 사기 — 한 집 여러 명 계약 사례 6가지',
  '전세금 반환 소송 — 임대인 잠적 시 1년 안에 받는 절차',

  // 추가 — 통합 검증 + 공공 API 활용
  '국토부 실거래가 API로 시세 확인 — 5분 절차',
  '국세청 사업자등록 진위 확인 — 임대인 폐업 즉시 탐지',
  '건축물대장 위반건축물 — 무허가 옥탑방 / 다세대 분할',
  '아파트 전세가율 통계 — 본인 매물 vs 단지 평균',
  '신탁 부동산 전세 — 한국토지신탁·코람코신탁 신호',
  '깡통전세 vs 역전세 — 차이와 본인 매물 진단',
  '전세사기 피해자 특별법 시행 — 2025 변경 요약',
  '청년 안심전세 보증 — 만 34세 이하 우대 상품',
  '경매개시결정 등기 — 발견 시 즉시 보류 + 법률 상담',
  '전세보증금 임의지급 — HUG 안심전세 1주일 절차',
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

/**
 * Steam Web API featuredcategories — free, no key, returns ACTUAL ongoing sales
 * with real prices/discounts/end dates. Each top-tier sale becomes a candidate
 * with verified context the LLM can quote without hallucinating.
 */
async function fetchSteamSales(): Promise<DealCandidate[]> {
  try {
    const res = await fetch('https://store.steampowered.com/api/featuredcategories?cc=KR&l=korean', {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const out: DealCandidate[] = [];

    // Big sales (limited-time storewide — most newsworthy)
    const specials = json?.specials?.items || [];
    for (const it of specials.slice(0, 5)) {
      if (!it.discount_percent || it.discount_percent < 50) continue; // only meaningful discounts
      const priceFinal = it.final_price ? `₩${Math.round(it.final_price / 100).toLocaleString()}` : '?';
      const priceOriginal = it.original_price ? `₩${Math.round(it.original_price / 100).toLocaleString()}` : '?';
      out.push({
        title: `스팀 ${it.name} ${it.discount_percent}% 할인 — ${priceOriginal} → ${priceFinal}`,
        source: 'steam:specials',
        context: `현재 진행중. 정가 ${priceOriginal} → ${priceFinal} (${it.discount_percent}% off). Steam appid ${it.id}.`,
        link: `https://store.steampowered.com/app/${it.id}`,
      });
    }

    // Top sellers — strong commercial intent, even at small discounts
    const topSellers = json?.top_sellers?.items || [];
    for (const it of topSellers.slice(0, 3)) {
      if (!it.discount_percent || it.discount_percent < 30) continue;
      out.push({
        title: `${it.name} 스팀 베스트셀러 — ${it.discount_percent}% 할인`,
        source: 'steam:top_sellers',
        context: `Steam 베스트셀러 + 현재 ${it.discount_percent}% 할인.`,
        link: `https://store.steampowered.com/app/${it.id}`,
      });
    }

    return out;
  } catch (e) {
    console.warn('steam fetch failed:', e instanceof Error ? e.message : e);
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
  "tag": one of ["게임할인","AI 도구","카드/핀테크","OTT","직구/쇼핑","항공/여행","소프트웨어","Steam","주택/청약","정부지원","대행함정","전세사기"],
  "title": "기사 제목 (60자 이내)",
  "description": "메타 설명 (140자 이내)",
  "excerpt": "리스트 카드용 한 줄 (90자 이내)",
  "minutes": int 4-7,
  "sources": "참고한 출처 1-3개 (예: Reddit r/GameDeals, Steam, 토스뱅크 공식)",
  "body_md": "Astro 페이지 본문 — 마크다운 + Callout 컴포넌트.\\n첫 단락은 <p class=\\"lead\\">로.\\n표는 마크다운 표 사용.",
  "faqs": [{"q": "자주 묻는 질문", "a": "답변 (60-200자)"}, ...]  // optional, 2-4개. Google FAQ rich snippet 대상.
  "howto": {                                                       // optional, HOW-TO 글일 때만.
    "name": "어떤 절차인지",
    "steps": [{"name": "단계명", "text": "단계 설명 50-200자"}, ...]
  }
}

GOLDEN RULE: faqs/howto는 본문에 없는 정보 만들지 말고, 본문에서 직접 발췌해서 채워라.
HOW-TO 토픽 ("받는 법", "신청법", "어떻게") 이면 howto 필수, FAQ는 선택.
COMPARISON/LISTICLE이면 faqs 권장, howto 생략.`;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

async function callGemini(userMsg: string): Promise<string | null> {
  if (QUOTA_EXHAUSTED) return null;
  if (API_KEYS.length === 0) throw new Error('No GEMINI_API_KEY* env vars set');

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

  // Outer loop: rotate keys when one gets quota-exhausted.
  // Inner loop: retry transient 503/429 on the active key.
  while (true) {
    const apiKey = getActiveKey();
    if (!apiKey) {
      console.warn('All Gemini API keys exhausted — aborting remaining candidates.');
      return null;
    }

    let transientError = false;
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
      // Daily quota exhausted on this key: rotate.
      if (res.status === 429 && /exceeded your current quota|GenerateRequestsPerDayPerProjectPerModel/i.test(errText)) {
        markCurrentKeyExhausted();
        transientError = true;
        break; // inner loop — outer will pick next key
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

    if (!transientError) return null;
    // else: outer loop picks next key
  }
}

// Brand → affiliates.ts key. Lowercased for case-insensitive matching.
// Order matters: longer / more specific names first to avoid partial overlap
// (e.g. "트래블월렛" must match before generic "트래블").
const BRAND_TO_AFFILIATE: Array<[string, string]> = [
  ['트래블월렛', 'travelWallet'],
  ['트래블로그', 'travelLog'],
  ['카카오뱅크', 'kakaobank'],
  ['쿠팡플레이', 'coupangPlay'],
  ['쿠팡파트너스', 'coupangPartners'],
  ['쿠팡 파트너스', 'coupangPartners'],
  ['쿠팡', 'coupangSearch'],
  ['nordvpn', 'nordvpn'],
  ['surfshark', 'surfshark'],
  ['cursor', 'cursor'],
  ['notion', 'notion'],
  ['midjourney', 'midjourney'],
  ['claude pro', 'claude'],
  ['claude', 'claude'],
  ['chatgpt plus', 'chatgpt'],
  ['chatgpt', 'chatgpt'],
  ['넷플릭스', 'netflix'],
  ['netflix', 'netflix'],
  ['디즈니플러스', 'disneyplus'],
  ['디즈니+', 'disneyplus'],
  ['apple tv+', 'appleTv'],
  ['agoda', 'agoda'],
  ['아고다', 'agoda'],
  ['booking.com', 'booking'],
  ['부킹닷컴', 'booking'],
  ['trip.com', 'trip'],
  ['steam', 'steam'],
  ['스팀', 'steam'],
  ['epic games', 'epic'],
  ['에픽 게임즈', 'epic'],
  ['cloudflare', 'cloudflare'],
  ['vercel', 'vercel'],
  ['wise', 'wise'],
  ['토스뱅크', 'toss'],
  ['토스', 'toss'],
];

/**
 * First-mention affiliate injection: scan body markdown and wrap the FIRST
 * occurrence of each known brand with <AffiliateLink to="key">brand</AffiliateLink>.
 * Subsequent mentions are left as plain text — over-linking hurts UX and
 * gets flagged as affiliate spam by Google.
 *
 * Returns: { body, usedKeys } so the caller can decide whether to import
 * the AffiliateLink component into the generated file.
 */
function injectAffiliateLinks(body: string): { body: string; usedKeys: string[] } {
  const used = new Set<string>();
  let out = body;

  for (const [brand, key] of BRAND_TO_AFFILIATE) {
    if (used.has(key)) continue;

    // Word-boundary-ish regex (case-insensitive). Korean text doesn't have
    // word boundaries, so we use lookahead/lookbehind for non-letter chars.
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Avoid matching inside existing <AffiliateLink> tags or code blocks.
    const re = new RegExp(
      `(?<![\\w<\\[\\(])(${escaped})(?![\\w>\\]\\)])`,
      'i',
    );
    const match = re.exec(out);
    if (!match) continue;

    // Don't replace if the match is inside an existing tag/component.
    const before = out.slice(0, match.index);
    const openTags = (before.match(/<[^/][^>]*$/) || []).length;
    if (openTags > 0) continue;

    const replacement = `<AffiliateLink to="${key}">${match[1]}</AffiliateLink>`;
    out = out.slice(0, match.index) + replacement + out.slice(match.index + match[0].length);
    used.add(key);
  }

  return { body: out, usedKeys: [...used] };
}

/**
 * Auto internal linking: scan body for matches against existing article titles
 * (manual guides + previous auto-issues) and add markdown links to them on first
 * mention. Boosts internal link density (Google ranking factor) without manual
 * editing. Capped at 3 links per article so it doesn't look spammy.
 *
 * Also adds /tag/<slug> link on first occurrence of any registered tag.
 */
function injectInternalLinks(
  body: string,
  excludeSlug: string,
  guides: Array<{ slug: string; title: string; tag: string }>,
  autoSlugs: Array<{ slug: string; title: string; tag: string }>,
): string {
  let out = body;
  let added = 0;
  const MAX_LINKS = 3;
  const used = new Set<string>();

  const all = [
    ...guides.map((g) => ({ ...g, href: `/guides/${g.slug}/` })),
    ...autoSlugs.map((a) => ({ ...a, href: `/issues/${a.slug}/` })),
  ].filter((x) => x.slug !== excludeSlug);

  // Sort by title length desc — longer matches first (avoid partial overlap)
  all.sort((a, b) => b.title.length - a.title.length);

  for (const a of all) {
    if (added >= MAX_LINKS) break;
    if (used.has(a.slug)) continue;

    // Match by 8+ char substring of title (avoid matching common short words)
    const fragment = a.title.slice(0, Math.max(8, Math.floor(a.title.length * 0.5)));
    if (fragment.length < 8) continue;

    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<!\\[)(${escaped})(?!\\]|<\\/a>)`, 'i');
    const match = re.exec(out);
    if (!match) continue;

    // Avoid replacing inside an existing markdown link or tag
    const before = out.slice(0, match.index);
    const lastOpenBracket = before.lastIndexOf('[');
    const lastCloseBracket = before.lastIndexOf(']');
    if (lastOpenBracket > lastCloseBracket) continue;

    const linkMd = `[${match[1]}](${a.href})`;
    out = out.slice(0, match.index) + linkMd + out.slice(match.index + match[0].length);
    used.add(a.slug);
    added++;
  }

  return out;
}

/**
 * Fix common LLM output errors before writing to disk.
 * Astro/JSX is strict — lowercase component names render as HTML strings,
 * unbalanced tags break the build, etc. We patch up known mistakes here so
 * we don't get a Vercel build error from a single bad LLM run.
 */
function sanitizeBody(body: string): string {
  let out = body;

  // 1. Component names must be PascalCase (lowercase = treated as HTML element)
  out = out.replace(/<callout(\s|>|\/)/g, '<Callout$1');
  out = out.replace(/<\/callout>/g, '</Callout>');
  out = out.replace(/<affiliateLink(\s|>|\/)/g, '<AffiliateLink$1');
  out = out.replace(/<\/affiliateLink>/g, '</AffiliateLink>');

  // 2. Strip empty title="" attributes (visual noise + accessibility)
  out = out.replace(/\stitle=""/g, '');

  // 3. Markdown fence drift: LLM sometimes wraps the whole body in ```html / ```
  out = out.replace(/^\s*```(?:html|md|markdown|astro)?\s*\n?/i, '');
  out = out.replace(/\n?\s*```\s*$/i, '');

  // 4. Astro chokes on bare ampersands inside text. Convert standalone & to &amp;
  // (preserve already-encoded entities and JSX expressions).
  out = out.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

  // 5. Curly-brace gotcha: { in plain text becomes a JSX expression.
  // Only escape when not inside an obvious JSX attribute (attr={...}).
  // Conservative: replace `{` not followed by `<word>=` or inside common code patterns.
  // Skipped for now — too easy to break legitimate content; LLMs rarely output stray {.

  // 6. Self-closing tags that shouldn't be self-closing (e.g. <br/>) are OK in JSX.

  // 7. Strip <script> tags entirely — LLM sometimes wraps inline JS that breaks build.
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');

  return out;
}

async function generateArticle(
  item: DealCandidate,
  internalLinkSources: {
    guides: Array<{ slug: string; title: string; tag: string }>;
    autoSlugs: Array<{ slug: string; title: string; tag: string }>;
  } = { guides: [], autoSlugs: [] },
): Promise<{
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

  const faqsAttr = Array.isArray(parsed.faqs) && parsed.faqs.length > 0
    ? `\n  faqs={${JSON.stringify(parsed.faqs)}}`
    : '';
  const howtoAttr = parsed.howto && Array.isArray(parsed.howto.steps) && parsed.howto.steps.length > 0
    ? `\n  howto={${JSON.stringify(parsed.howto)}}`
    : '';

  // Affiliate disclosure: required by 표시광고법 for any commercial-intent article.
  // Government/housing posts are pure public-info and don't carry affiliate links.
  const COMMERCIAL_TAGS = new Set([
    '게임할인', 'AI 도구', '카드/핀테크', 'OTT', '직구/쇼핑',
    '항공/여행', '소프트웨어', 'Steam',
  ]);
  const isCommercial = COMMERCIAL_TAGS.has(meta.tag);

  // Pipeline: sanitize → internal-link → affiliate-link.
  // Internal links boost SEO compounding (Google rewards link density across
  // own pages). Run before affiliate links so they don't fight over the same
  // brand-name token.
  let rawBody = sanitizeBody(parsed.body_md || '');
  rawBody = injectInternalLinks(
    rawBody,
    slug,
    internalLinkSources.guides,
    internalLinkSources.autoSlugs,
  );
  const { body: bodyWithAff, usedKeys } =
    isCommercial ? injectAffiliateLinks(rawBody) : { body: rawBody, usedKeys: [] };

  const showDisclosure = isCommercial && usedKeys.length > 0;
  const importAffiliateLink = usedKeys.length > 0;

  const imports = [
    `import ArticleLayout from '../../../layouts/ArticleLayout.astro';`,
    `import Callout from '../../../components/Callout.astro';`,
    showDisclosure && `import AffiliateDisclosure from '../../../components/AffiliateDisclosure.astro';`,
    importAffiliateLink && `import AffiliateLink from '../../../components/AffiliateLink.astro';`,
  ].filter(Boolean).join('\n');

  const fileBody = `---
${imports}
---
<ArticleLayout
  title=${JSON.stringify(meta.title)}
  description=${JSON.stringify(parsed.description || '')}
  slug=${JSON.stringify(slug)}
  updated=${JSON.stringify(today)}
  sources=${JSON.stringify(parsed.sources || '')}${faqsAttr}${howtoAttr}
>
${showDisclosure ? '\n<AffiliateDisclosure />\n' : ''}
${bodyWithAff}

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
  if (API_KEYS.length === 0) {
    console.error('At least one of GEMINI_API_KEY / GEMINI_API_KEY_2 / GEMINI_API_KEY_3 must be set');
    process.exit(1);
  }
  console.log(`Configured ${API_KEYS.length} Gemini API key(s) (rotation enabled)`);

  console.log('1. Fetching deal candidates...');
  const allItems: DealCandidate[] = [];

  // Evergreen seeds FIRST — Korea-targeted, guaranteed-relevant topics. These
  // form the backbone so we never have a zero-article run, and rotate so the
  // engine eventually covers all 26 seeds.
  const evergreen = pickEvergreen(MAX_NEW_PER_RUN * 3);
  allItems.push(...evergreen);
  console.log(`   evergreen seeds (priority): ${evergreen.length}`);

  // Steam API — free, returns REAL ongoing sales with prices in KRW. Highest
  // signal for game-deal articles since the LLM can quote verified numbers.
  const steam = await fetchSteamSales();
  if (steam.length > 0) {
    allItems.push(...steam);
    console.log(`   steam:specials/top_sellers: ${steam.length} verified sales`);
  }

  // 정부지원 RSS — Korean policy/grant feeds. High commercial intent ("청년 월세
  // 받는 법") + high search volume + low competition.
  for (const feed of GOV_RSS_FEEDS) {
    const items = await fetchGovRss(feed);
    if (items.length > 0) {
      allItems.push(...items);
      console.log(`   gov:${feed.name}: ${items.length} policy items`);
    }
  }

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

  // Internal-link sources: existing manual guides + previously-generated auto issues.
  // Loaded once, passed to each generateArticle call.
  const internalGuides = allGuides.map((g) => ({
    slug: g.slug, title: g.title, tag: g.tag,
  }));
  let internalAutoSlugs: Array<{ slug: string; title: string; tag: string }> = [];
  try {
    const mod = await import('../src/data/guides.auto');
    internalAutoSlugs = ((mod as any).autoGuides || []).map((a: any) => ({
      slug: a.slug, title: a.title, tag: a.tag,
    }));
  } catch { /* first run */ }
  console.log(`   internal link pool: ${internalGuides.length} guides + ${internalAutoSlugs.length} issues`);

  const generated: GeneratedMeta[] = [];
  await fs.mkdir(ISSUES_DIR, { recursive: true });

  for (const cand of candidates) {
    if (generated.length >= MAX_NEW_PER_RUN) break;
    console.log(`3. Generating: ${cand.title}`);
    try {
      const result = await generateArticle(cand, {
        guides: internalGuides,
        autoSlugs: internalAutoSlugs,
      });
      if (!result) continue;
      const slugDir = path.join(ISSUES_DIR, result.meta.slug);
      await fs.mkdir(slugDir, { recursive: true });
      await fs.writeFile(path.join(slugDir, 'index.astro'), result.fileBody, 'utf8');
      generated.push(result.meta);
      // Newly-generated articles enter the link pool for the rest of this run too
      internalAutoSlugs.unshift({
        slug: result.meta.slug, title: result.meta.title, tag: result.meta.tag,
      });
      console.log(`   wrote ${result.meta.slug}`);
    } catch (e) {
      console.error(`   error on "${cand.title}":`, e instanceof Error ? e.message : e);
    }
  }

  if (generated.length > 0) {
    await appendAutoMeta(generated);
    console.log(`4. Appended ${generated.length} entries to guides.auto.ts`);

    // Emit fresh URL list for IndexNow (Bing/Yandex/Seznam auto-discover).
    // Picked up by the workflow's next step and POSTed without user action.
    const urls = generated.map(
      (m) => `https://allthatai-real.vercel.app/issues/${m.slug}/`
    );
    await fs.writeFile(
      path.join(ROOT, 'fresh-urls.txt'),
      urls.join('\n') + '\n',
      'utf8',
    );
    console.log(`   wrote fresh-urls.txt (${urls.length} URLs)`);
  } else {
    console.log('4. Nothing new generated this run');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
