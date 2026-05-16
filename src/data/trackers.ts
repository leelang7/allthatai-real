/**
 * Live keyword tracker registry.
 *
 * Each tracker has:
 *   - slug: URL path (/trackers/<slug>)
 *   - title / description: SEO copy
 *   - keywords: Google News RSS query (Korean) — daily polled
 *   - context: human-written background that's stable (history of the event)
 *   - relatedSites: external URLs to embed/link
 *
 * Daily updates auto-fetched by scripts/update-trackers.ts → trackers.live.json.
 * Each tracker page reads both this static config + the live JSON.
 */

export interface TrackerSpec {
  slug: string;
  title: string;
  /** SEO meta description */
  description: string;
  /** Display tagline above the timeline */
  tagline: string;
  /** Google News RSS query (Korean) */
  query: string;
  /** Stable background — what is this thing, why does it matter */
  context: string;
  /** Optional external links shown in sidebar */
  relatedSites?: { name: string; url: string }[];
  /** Tag for visual color coding */
  tag: string;
  tagColor: string;
  /** When tracker was first created — used for ordering on hub */
  createdAt: string;
}

export const trackers: TrackerSpec[] = [
  {
    slug: 'lck-2026',
    title: 'LCK 2026 시즌 — 실시간 추적',
    description: 'LCK 2026 모든 매치 결과·이적·인터뷰 자동 수집. T1·DK·GenG·HLE 핵심 일정.',
    tagline: 'LCK 2026 매일 자동 업데이트',
    query: 'LCK 2026',
    context: 'LCK(League of Legends Champions Korea) 2026 시즌 일정·결과·인터뷰를 자동 수집합니다. Spring/Summer split, 플레이오프, 월드 챔피언십 진출 일정 모두 포함.',
    relatedSites: [
      { name: 'LCK 공식', url: 'https://lck.co.kr' },
      { name: 'LoLButler 챔피언 빌드', url: 'https://lolbutler.allthatai.kr' },
    ],
    tag: 'esports',
    tagColor: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    createdAt: '2026-05-09',
  },
  {
    slug: 'bitcoin-krw',
    title: '비트코인 한국 시장 — 김치프리미엄 추적',
    description: '비트코인·이더리움 한국 시장 가격·김치프리미엄·규제 뉴스 자동 수집.',
    tagline: '비트코인 + 김치프리미엄 매일 업데이트',
    query: '비트코인 김치프리미엄',
    context: '비트코인·이더리움 한국 거래소(업비트·빗썸·코인원) 가격 동향과 김치프리미엄, 금융위 규제 변화를 자동 수집. 가격 자체는 거래소 직접 확인 권장.',
    relatedSites: [
      { name: '업비트', url: 'https://upbit.com' },
      { name: '빗썸', url: 'https://www.bithumb.com' },
      { name: 'CoinGecko KRW', url: 'https://www.coingecko.com/ko' },
    ],
    tag: '코인',
    tagColor: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    createdAt: '2026-05-09',
  },
  {
    slug: 'apt-buy-2026',
    title: '아파트 청약 2026 — 실시간 분양 정보',
    description: '주요 단지 청약 일정·당첨 가점·특별공급·후분양·임대 분양 자동 수집.',
    tagline: '청약 일정·결과 매일 업데이트',
    query: '아파트 청약 분양',
    context: '한국 주요 단지 청약 일정·당첨 가점·특별공급 자격 변경 자동 수집. 청약홈 공식 데이터 + 언론 보도. 가점 계산은 본인이 청약홈에서 직접.',
    relatedSites: [
      { name: '청약홈', url: 'https://www.applyhome.co.kr' },
      { name: 'LH 청약센터', url: 'https://apply.lh.or.kr' },
    ],
    tag: '주택',
    tagColor: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
    createdAt: '2026-05-09',
  },
  {
    slug: 'youth-policy',
    title: '청년 정책 2026 — 정부지원 추적',
    description: '청년 월세·도약계좌·재직 지원·해외 진출·창업 지원 등 청년 대상 정부 정책.',
    tagline: '신규 청년 정책 매일 자동 수집',
    query: '청년 정책 지원',
    context: '국토부·여가부·금융위·고용부·중기부 등에서 발표하는 청년 정책을 자동 수집. 청년 월세 한시 지원·도약계좌·재직 지원금 등 자격·금액·신청 절차.',
    relatedSites: [
      { name: '청년정책 종합', url: 'https://www.youthcenter.go.kr' },
      { name: '정부24', url: 'https://www.gov.kr' },
    ],
    tag: '정부지원',
    tagColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    createdAt: '2026-05-09',
  },
  {
    slug: 'ai-model-launch',
    title: '새 AI 모델 출시 — 실시간 추적',
    description: 'Claude·GPT·Gemini·Llama·Grok·DeepSeek 신모델 출시·가격·벤치마크.',
    tagline: 'AI 신모델 출시·가격·벤치마크',
    query: 'Claude GPT Gemini 새 모델',
    context: '주요 AI 기업의 신모델 출시·가격 변경·벤치마크 결과·한국 결제 가능성을 자동 수집. Anthropic/OpenAI/Google/Meta/xAI/DeepSeek 공식 발표 기반.',
    relatedSites: [
      { name: 'Anthropic 공식', url: 'https://www.anthropic.com/news' },
      { name: 'OpenAI 블로그', url: 'https://openai.com/blog' },
      { name: 'AllThatAI Real AI 도구', url: '/deals/ai/' },
    ],
    tag: 'AI',
    tagColor: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    createdAt: '2026-05-09',
  },
  {
    slug: 'jeonse-fraud',
    title: '전세사기 사례·판결·정부 발표 — 실시간 추적',
    description: '신규 전세사기 사례·법원 판결·HUG 정책·국토부 특별법 변경 자동 수집.',
    tagline: '전세사기 모든 새 소식 매일 갱신',
    query: '전세사기',
    context: '한국 전세사기 관련 모든 새 보도·판결·정부 발표를 자동 수집합니다. 사기 수법·HUG 보증 정책 변경·특별법 진행·피해자 지원 절차 등.',
    relatedSites: [
      { name: '전세사기 위험 진단', url: '/jeonse/risk-calc/' },
      { name: '등기부등본 분석', url: '/jeonse/etungi-analyzer/' },
      { name: 'HUG 안심전세', url: 'https://www.khug.or.kr' },
    ],
    tag: '전세사기',
    tagColor: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    createdAt: '2026-05-16',
  },
  {
    slug: 'faker-grok',
    title: '페이커 그록 대결 — 실시간 추적',
    description: 'T1 페이커 vs xAI 그록 — 모든 공식 발표·인터뷰·매치 결과를 자동 수집. Google News + 공식 채널 기반.',
    tagline: 'Faker × Grok 모든 업데이트 자동 수집',
    query: '페이커 그록',
    context: `T1 페이커(이상혁)와 xAI의 Grok이 얽힌 모든 공개 콘텐츠를 일별로 추적합니다.
LoL 프로 vs AI 분석 모델, 인터뷰 발언, 영상 콘텐츠, 스폰서십 등 — 출처 명시된 1차 자료만.
페이지는 매일 자정(KST)에 자동 업데이트되며, IndexNow로 검색엔진에 즉시 push.`,
    relatedSites: [
      { name: 'T1 공식', url: 'https://www.t1.gg/' },
      { name: 'Faker 인스타그램', url: 'https://www.instagram.com/faker/' },
      { name: 'Grok (xAI)', url: 'https://x.ai/' },
      { name: 'LoLButler 챔피언 빌드', url: 'https://lolbutler.allthatai.kr' },
    ],
    tag: 'esports',
    tagColor: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    createdAt: '2026-05-08',
  },
];

export type TrackerSlug = typeof trackers[number]['slug'];

export function findTracker(slug: string): TrackerSpec | undefined {
  return trackers.find((t) => t.slug === slug);
}
