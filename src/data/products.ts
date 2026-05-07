/**
 * Digital products catalog (Gumroad-based MVP).
 *
 * Why Gumroad: zero setup, accepts international cards, handles tax/EU VAT,
 * pays out monthly. ~10% take rate. Once monthly revenue passes ~₩100K,
 * migrate to TossPayments + 사업자 직발행 to cut fees to ~3%.
 *
 * Sign-up flow:
 *   1. Create products at https://app.gumroad.com (free, ~3 min each)
 *   2. Set price in KRW or USD
 *   3. Upload deliverable (PDF / ZIP / Notion template URL)
 *   4. Copy product URL → paste into `gumroadUrl` below
 *   5. Set `live: true`
 *
 * Each product becomes a real page at /store/<slug>/ with:
 *   - landing copy + sample preview
 *   - "Buy on Gumroad" CTA (opens Gumroad checkout in new tab)
 *   - rel="sponsored" tracked, attribution to Vercel/GA4
 */

export interface Product {
  slug: string;
  title: string;
  /** One-line value prop (under hero) */
  tagline: string;
  /** Korean won price for display ("₩9,900") — must match Gumroad listing */
  priceKrw: string;
  /** Hero badge (e.g. "베스트", "신규", "한정") */
  badge?: string;
  /** Bullet list of what's inside */
  inside: string[];
  /** Who this is for */
  audience: string[];
  /** Why your version is better than the alternatives — your moat */
  moat: string;
  /** Gumroad product URL — required to be live=true */
  gumroadUrl: string;
  /** When set, the /store page hides the buy button and shows "준비중" */
  live: boolean;
  /** Tag for grouping */
  category: '출시' | '사업자' | '템플릿' | '가이드';
  /** Optional: rough pages / time-savings */
  metric?: string;
}

export const products: Product[] = [
  {
    slug: 'play-store-launch-pdf',
    title: 'Flutter 앱 Play Store 출시 완전판 PDF',
    tagline: '혼자 5일 헤맬 일을 1–2일에. 키스토어부터 IAP까지 실전 매뉴얼.',
    priceKrw: '₩9,900',
    badge: '베스트',
    metric: '90+ 페이지 / 13개 함정 정리',
    inside: [
      'upload-keystore.jks 만들기 + 비밀번호 백업 체계',
      '패키지 ID 결정 함정 (com.example.* 등록 후 변경 불가)',
      'AAB 서명 빌드 + R8/ProGuard + 16KB align 검증',
      'Play Console 13개 항목 (개인정보·콘텐츠 등급·데이터 보안 등) 항목별 답변 예시',
      'DUNS 무료 경로 (한국 대행 ₩10–20만 안 내고 D&B 본사 직접)',
      '통신판매업 면제 소명서 (실제 사용한 PDF/HWP 템플릿 포함)',
      'IAP SKU 설계 + Google Play Billing 연동 코드 샘플',
      '14일/12명 면제 받기 — 개인 → 조직 계정 전환 가이드',
      '첫 출시 후 7일 ANR/크래시 대응 체크리스트',
    ],
    audience: [
      '첫 Play Store 출시하는 인디 개발자',
      'Flutter / React Native / Native 모두',
      '대행사에 ₩50만 쓰기 싫은 1인 개발자',
    ],
    moat: '대행사가 아닌 실제 출시 경험자가 만든 매뉴얼. AllThatFinder 출시하면서 헤맨 모든 함정을 시간 순서대로 정리.',
    gumroadUrl: '',  // TODO: Create on Gumroad and paste here
    live: false,
    category: '출시',
  },
  {
    slug: 'tongsin-template-bundle',
    title: '통신판매업 면제 소명서 템플릿 번들',
    tagline: '구청 재출 안 받고 한 번에 통과 — PDF/HWP/JPG + 첨부 체크리스트',
    priceKrw: '₩4,900',
    metric: '5개 포맷 + 작성 가이드',
    inside: [
      '통신판매업 면제 소명서 (PDF / HWP / DOC / JPG / TXT)',
      '서명 이미지 임베드 위치 + 도장 처리법',
      '면제 사유 작성 예시 5종 (앱 출시·SaaS·B2B·콘텐츠·교육)',
      '구청 신청 절차 + 첨부서류 체크리스트',
      '국세청 통신판매업 vs 면제 의무 분류표',
      '신청 거절 시 재제출 사유별 대응법',
    ],
    audience: [
      '앱·SaaS 출시 위해 결제대금예치 면제 받아야 하는 분',
      '연 매출 1200만원 이하 1인 사업자',
      '구청 재출 안 받고 싶은 분',
    ],
    moat: 'Play Store 출시용으로 직접 작성·승인받은 실제 문서 그대로. 양식만 받고 못 채우는 사람을 위한 작성 예시 5종 포함.',
    gumroadUrl: '',
    live: false,
    category: '사업자',
  },
  {
    slug: 'duns-free-route-guide',
    title: 'DUNS 무료 발급 완전 가이드',
    tagline: 'D&B 본사 직접 신청 — 한국 대행 ₩10–20만 → ₩0',
    priceKrw: '₩2,900',
    metric: '15페이지 / 2주 발급 보증',
    inside: [
      'D&B 본사(미국) 직접 신청 폼 작성 단계별 스크린샷',
      'NICE D&B (한국 대행사) vs 직접 신청 비교',
      '발급까지 평균 소요 시간 + 빠르게 받는 팁',
      '발급 후 Play Console 조직 전환 절차',
      '14일/12명 면제 활용법',
      '실제 발급된 DUNS 번호 인증 스크린샷 (개인정보 마스킹)',
    ],
    audience: [
      'Play Console 조직 계정 전환 필요한 1인 사업자',
      'NICE D&B 대행 ₩10–20만 안 쓰고 싶은 분',
    ],
    moat: 'AllThatFinder 출시하면서 직접 받은 DUNS 번호 — 한국 대행 안 쓰고 D&B 본사로 신청해서 0원에 받은 실제 절차.',
    gumroadUrl: '',
    live: false,
    category: '출시',
  },
  {
    slug: 'iap-billing-code-pack',
    title: 'Flutter IAP 연동 코드팩',
    tagline: 'in_app_purchase 패키지 + restore + completePurchase 풀스택 샘플',
    priceKrw: '₩7,900',
    metric: '실전 코드 + 테스트 시나리오',
    inside: [
      'in_app_purchase 3.x 풀 통합 코드 (Dart)',
      'Google Play Billing API v6 호환',
      'restore + entitlement persistence',
      'completePurchase 누락 시 환불 자동 처리',
      'iOS App Store + Android 동시 지원',
      'Play Console SKU 설계 가이드',
      '테스트 카드/계정 설정 + 샌드박스 시나리오',
    ],
    audience: [
      'Flutter 앱에 IAP 붙이는 개발자',
      'mock에서 real billing으로 이전하는 분',
    ],
    moat: 'AllThatFinder Pro에 실제 출시·결제된 코드 그대로. mock IAP에서 real 전환하면서 발견한 함정 (entitlement loss, restore race) 문서화.',
    gumroadUrl: '',
    live: false,
    category: '템플릿',
  },
  {
    slug: 'ai-korea-payment-pack',
    title: '한국에서 AI 도구 결제 완전 정복',
    tagline: 'Claude · GPT · Gemini · Cursor — 한국카드 거부될 때 우회 4가지',
    priceKrw: '₩9,900',
    badge: '신규',
    metric: '40+ 페이지 / 4개 우회법 + 7개 도구별 가이드',
    inside: [
      'Claude Pro 한국카드 통과율 + 거부 시 4단계 우회',
      'ChatGPT Plus + Team — 한국 가입 함정 (요청-수락-결제 분리)',
      '트래블월렛 vs Wise 가상카드 — Stripe 통과율 비교 데이터',
      'PayPal 우회 + 한국 발행 카드 등록 절차',
      'Cursor / Notion / Midjourney / Perplexity 도구별 결제 메모',
      '학생 이메일 인증 자동 통과 팁 (Notion/Figma/GitHub Pro)',
      '환불 처리 — 결제 실패 시 어떻게 환불받나',
    ],
    audience: [
      'Claude/GPT 결제 막혀서 못 쓰는 한국 사용자',
      '여러 AI 도구 묶음 사용 중인 개발자',
      '학생 인증으로 무료 받고 싶은 학생',
    ],
    moat: 'allthatai-real 운영자가 본인 카드로 직접 시도해본 결과 데이터. 도구별 거부율·우회법 정직 비교.',
    gumroadUrl: '',
    live: false,
    category: '가이드',
  },
  {
    slug: 'indie-business-checklist',
    title: '한국 인디 개발자 1인 사업자 체크리스트',
    tagline: '사업자 등록부터 부가세 신고까지 — Notion 템플릿',
    priceKrw: '₩5,900',
    metric: 'Notion 템플릿 + 12개월 체크',
    inside: [
      '사업자 등록 (홈택스) — 업종 코드 추천',
      '사업용 계좌 분리 + 카드 설정',
      '간편장부 vs 복식부기 의사결정',
      '부가세 신고 일정 (1월/7월) + 자동 알림',
      '종합소득세 신고 체크리스트',
      '신용카드 매입 → 비용 처리 자동화',
      '1년치 연간 일정 (Notion 캘린더)',
    ],
    audience: [
      '앱·SaaS로 매출 발생한 개발자',
      '사업자 등록 막 끝낸 분',
    ],
    moat: 'Notion 템플릿이라 본인 환경에 맞춰 customize 가능. 세무사 안 끼고 1년 굴리기 위한 최소 체크리스트.',
    gumroadUrl: '',
    live: false,
    category: '템플릿',
  },
];

export function liveProducts() {
  return products.filter((p) => p.live);
}

export function findProduct(slug: string) {
  return products.find((p) => p.slug === slug);
}
