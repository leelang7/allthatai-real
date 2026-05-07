/**
 * Central registry of affiliate / referral links.
 *
 * Every outbound commercial link should go through this registry so:
 *   1. swapping a tracking code propagates everywhere automatically
 *   2. AffiliateLink renders rel="sponsored" + click events for attribution
 *   3. articles can reference programs by short key, even before sign-up
 *
 * STATUS LEGEND for `signupUrl` comments below:
 *   ✅ — already signed up, ref code filled
 *   📝 — apply at signupUrl, paste ref code into `code` field
 *   🟡 — partner link uses raw URL until program signup completes
 */

export type Affiliate = {
  /** Short program name (display) */
  name: string;
  /** Where to sign up for the program */
  signupUrl: string;
  /** Tracking link template (`{code}` is replaced with the ref code) OR raw URL */
  baseUrl: string;
  /** Your tracking / referral code. Empty until signup. */
  code?: string;
  /** Headline commission rate (display only) */
  rate?: string;
  /** Category for filtering / cross-sell */
  category: 'fintech' | 'card' | 'travel' | 'ott' | 'ai' | 'game' | 'dev' | 'shopping' | 'vpn';
  /** Notes for self */
  notes?: string;
};

export const affiliates: Record<string, Affiliate> = {
  // ===== Korean Fintech / Card =====
  toss: {
    name: '토스',
    signupUrl: 'https://toss.im/_m/recommend',                // 📝 친구초대 코드 받기
    baseUrl: 'https://toss.im/_m/{code}',
    code: '',
    rate: '신규 ₩5,000',
    category: 'fintech',
    notes: '앱 우측 상단 → 친구 초대 → 내 추천코드',
  },
  kakaobank: {
    name: '카카오뱅크',
    signupUrl: 'https://www.kakaobank.com/landing/event/recommend',
    baseUrl: 'https://www.kakaobank.com/landing/event/recommend?code={code}',
    code: '',
    rate: '신규 ₩3,000~',
    category: 'fintech',
  },
  travelWallet: {
    name: '트래블월렛',
    signupUrl: 'https://travel-wallet.com',
    baseUrl: 'https://travel-wallet.com/?ref={code}',
    code: '',
    rate: '신규 ₩5,000',
    category: 'card',
    notes: '앱 → 마이 → 친구초대',
  },
  travelLog: {
    name: '하나카드 트래블로그',
    signupUrl: 'https://www.kebhana.com/cont/mall/mall08/mall0805/index.jsp',
    baseUrl: 'https://www.kebhana.com/cont/mall/mall08/mall0805/index.jsp',
    rate: '직접 링크',
    category: 'card',
  },
  wise: {
    name: 'Wise',
    signupUrl: 'https://wise.com/invite',
    baseUrl: 'https://wise.com/invite/dhc/{code}',
    code: 'leescv', // ✅ 활성
    rate: '신규 무료송금 ₩900K',
    category: 'fintech',
  },

  // ===== Shopping / Coupang Partners =====
  // Coupang Partners: 1.5–4.5% deeplink commission. https://partners.coupang.com
  // Pattern: https://link.coupang.com/a/<short> — generated per product in dashboard.
  // Use `coupangSearch` for generic search box embed (high-volume, low-CTR).
  coupangPartners: {
    name: '쿠팡 파트너스',
    signupUrl: 'https://partners.coupang.com/',
    baseUrl: 'https://link.coupang.com/a/{code}',
    code: '',
    rate: '1.5–4.5%',
    category: 'shopping',
    notes: '상품별 단축링크를 대시보드에서 생성 → code 자리에 단축 슬러그',
  },
  coupangSearch: {
    name: '쿠팡',
    signupUrl: 'https://partners.coupang.com/',
    baseUrl: 'https://www.coupang.com/np/search',
    code: 'AF9592707', // ✅ Coupang Partners Tracking ID
    rate: '검색 후 7일 트래킹',
    category: 'shopping',
    notes: 'lptag 파라미터로 검색 URL에 자동 추가됨 (CoupangSearch.astro 참조)',
  },

  // ===== OTT =====
  netflix: {
    name: 'Netflix',
    signupUrl: 'https://www.netflix.com/kr/',
    baseUrl: 'https://www.netflix.com/kr/',
    rate: '직접 링크',
    category: 'ott',
  },
  disneyplus: {
    name: 'Disney+',
    signupUrl: 'https://www.disneyplus.com/ko-kr',
    baseUrl: 'https://www.disneyplus.com/ko-kr',
    rate: '직접 링크',
    category: 'ott',
  },
  coupangPlay: {
    name: '쿠팡플레이',
    signupUrl: 'https://www.coupangplay.com/',
    baseUrl: 'https://www.coupangplay.com/',
    rate: '직접 링크',
    category: 'ott',
  },
  appleTv: {
    name: 'Apple TV+',
    signupUrl: 'https://tv.apple.com/kr',
    baseUrl: 'https://tv.apple.com/kr',
    rate: '직접 링크',
    category: 'ott',
  },

  // ===== AI Tools =====
  claude: {
    name: 'Claude',
    signupUrl: 'https://claude.ai',
    baseUrl: 'https://claude.ai',
    rate: '직접 링크',
    category: 'ai',
  },
  chatgpt: {
    name: 'ChatGPT',
    signupUrl: 'https://chat.openai.com',
    baseUrl: 'https://chat.openai.com',
    rate: '직접 링크',
    category: 'ai',
  },
  cursor: {
    name: 'Cursor',
    signupUrl: 'https://cursor.com/affiliate',  // 📝 affiliate program
    baseUrl: 'https://cursor.com/?ref={code}',
    code: '',
    rate: '20% 첫 결제',
    category: 'ai',
  },
  midjourney: {
    name: 'Midjourney',
    signupUrl: 'https://www.midjourney.com/',
    baseUrl: 'https://www.midjourney.com/',
    rate: '직접 링크',
    category: 'ai',
  },
  notion: {
    name: 'Notion',
    signupUrl: 'https://affiliate.notion.so/',  // 📝 affiliate program
    baseUrl: 'https://www.notion.so/?ref={code}',
    code: '',
    rate: '50% 첫 12개월',
    category: 'dev',
  },

  // ===== VPN (high commission) =====
  nordvpn: {
    name: 'NordVPN',
    signupUrl: 'https://nordvpn.com/affiliates/',
    baseUrl: 'https://go.nordvpn.net/aff_c?offer_id=15&aff_id={code}',
    code: '',
    rate: '40% 첫 결제',
    category: 'vpn',
  },
  surfshark: {
    name: 'Surfshark',
    signupUrl: 'https://surfshark.com/affiliate',
    baseUrl: 'https://get.surfshark.net/aff_c?offer_id=323&aff_id={code}',
    code: '',
    rate: '40% 첫 결제',
    category: 'vpn',
  },

  // ===== Game stores =====
  steam: {
    name: 'Steam',
    signupUrl: 'https://store.steampowered.com/',
    baseUrl: 'https://store.steampowered.com/',
    rate: '직접 링크',
    category: 'game',
  },
  epic: {
    name: 'Epic Games',
    signupUrl: 'https://store.epicgames.com/ko/',
    baseUrl: 'https://store.epicgames.com/ko/',
    rate: '직접 링크',
    category: 'game',
  },

  // ===== Hosting / Dev =====
  cloudflare: {
    name: 'Cloudflare',
    signupUrl: 'https://www.cloudflare.com/',
    baseUrl: 'https://www.cloudflare.com/',
    rate: '직접 링크',
    category: 'dev',
  },
  vercel: {
    name: 'Vercel',
    signupUrl: 'https://vercel.com/',
    baseUrl: 'https://vercel.com/',
    rate: '직접 링크',
    category: 'dev',
  },

  // ===== Travel =====
  agoda: {
    name: 'Agoda',
    signupUrl: 'https://partners.agoda.com',  // 📝 partner program
    baseUrl: 'https://www.agoda.com/?cid={code}',
    code: '',
    rate: '4-7% 호텔',
    category: 'travel',
  },
  booking: {
    name: 'Booking.com',
    signupUrl: 'https://www.booking.com/affiliate-program/v2/index.html',
    baseUrl: 'https://www.booking.com/?aid={code}',
    code: '',
    rate: '25-40% 수수료의 일부',
    category: 'travel',
  },
  trip: {
    name: 'Trip.com',
    signupUrl: 'https://kr.trip.com/partners/',
    baseUrl: 'https://kr.trip.com/?Allianceid={code}',
    code: '',
    rate: '5% 호텔',
    category: 'travel',
  },
};

export type AffiliateKey = keyof typeof affiliates;

/** Resolve a programmatic key to a final, tracked URL. */
export function affiliateUrl(key: AffiliateKey): string {
  const a = affiliates[key];
  if (!a.code) return a.baseUrl.replace(/[?&]?[a-z_]+=\{code\}/i, '').replace(/\{code\}/g, '');
  return a.baseUrl.replace('{code}', encodeURIComponent(a.code));
}
