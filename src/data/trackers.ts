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
