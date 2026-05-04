/**
 * Central registry of affiliate / referral links.
 *
 * Auto-generator + manual articles can reference these by key, so updating
 * the URL in one place propagates everywhere. Empty string = not yet signed
 * up; use the bare URL for now and swap later.
 */
export const affiliates = {
  // Card / fintech
  toss: 'https://toss.im/',
  travelLog: 'https://www.kebhana.com/cont/mall/mall08/mall0805/index.jsp', // 트래블로그 안내
  travelWallet: 'https://travel-wallet.com/',
  wise: 'https://wise.com/invite/dhc/leescv', // your Wise referral
  // OTT / subscriptions
  netflix: 'https://www.netflix.com/kr/',
  disneyplus: 'https://www.disneyplus.com/ko-kr',
  coupangPlay: 'https://www.coupangplay.com/',
  appleTv: 'https://tv.apple.com/kr',
  // AI tools
  claude: 'https://claude.ai',
  chatgpt: 'https://chat.openai.com',
  cursor: 'https://cursor.com/',
  midjourney: 'https://www.midjourney.com/',
  // Game stores
  steam: 'https://store.steampowered.com/',
  epic: 'https://store.epicgames.com/ko/',
  // Hosting / dev
  cloudflare: 'https://www.cloudflare.com/',
  vercel: 'https://vercel.com/',
  // Travel
  agoda: 'https://www.agoda.com/',
  booking: 'https://www.booking.com/',
} as const;

export type AffiliateKey = keyof typeof affiliates;
