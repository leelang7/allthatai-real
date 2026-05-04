// Single source of truth for guide metadata.
// Each guide page imports its meta from this list (via slug); index/related grids
// also pull from here so adding a new guide only needs an entry here + a page file.

export interface GuideMeta {
  slug: string;
  title: string;
  excerpt: string;
  tag: string;
  minutes: number;
  hot?: boolean;
}

export const allGuides: GuideMeta[] = [
  {
    slug: 'nunutv-after-block',
    title: '누누티비 차단 후 — 합법 OTT 대안 5가지 가격 비교',
    excerpt: '미러 사이트 위험성 + Netflix·Disney+·쿠팡플레이·Apple TV+·티빙 정직 비교. OTT 로테이션 ₩10K/월 가능.',
    minutes: 6,
    tag: 'OTT',
    hot: true,
  },
  {
    slug: 'tvwiki-safety-check',
    title: '티비위키 안전한가 — 멀웨어·개인정보 유출 분석',
    excerpt: 'KISA 통계 + 결제 사기 패턴 + 광고 차단기로도 못 막는 위험. "무료"의 진짜 비용.',
    minutes: 5,
    tag: 'OTT',
    hot: true,
  },
  {
    slug: 'youth-monthly-rent-support',
    title: '청년 월세 지원금 ₩200,000/월 — 자격·신청·거절 사유',
    excerpt: '국토부 한시 특별지원 12개월. 직접 신청 0원 vs 대행 5-15만원. 거절 통계 + 이의신청.',
    minutes: 6,
    tag: '정부지원',
    hot: true,
  },
  {
    slug: 'small-business-policy-fund',
    title: '소상공인 정책자금 — 직접 vs 대행 컨설팅 50만원',
    excerpt: '한도 5천-1억, 금리 2-3%. 자격·서류·거절 사유 + 컨설팅 가치 분석.',
    minutes: 7,
    tag: '정부지원',
  },
  {
    slug: 'youth-leap-account',
    title: '청년도약계좌 — 5년에 ₩5,000만원 만드는 법',
    excerpt: '월 70만 적립 + 정부 매칭 3-6% + 비과세. 소득별 실수익률 시뮬레이션.',
    minutes: 6,
    tag: '정부지원',
  },
  {
    slug: 'chatgpt-korea-payment',
    title: 'ChatGPT 한국에서 결제 안 될 때 — 합법 우회 4가지',
    excerpt: '트래블로그 · Wise · OpenAI 한국 결제. VPN 우회는 왜 비추인가.',
    minutes: 4,
    tag: 'AI',
  },
  {
    slug: 'claude-vs-gpt-korea',
    title: 'Claude vs ChatGPT — 한국 사용자 입장 비교',
    excerpt: '결제 편의 / 한국어 / 코딩 / 무료 한도 5축 비교.',
    minutes: 5,
    tag: 'AI',
  },
  {
    slug: 'netflix-us-vs-kr-price',
    title: 'Netflix 한국 vs 미국 — 같은 돈으로 더 받는 법',
    excerpt: '계정 분담 · 통신사 결합 · OTT 로테이션. 합법 절감만.',
    minutes: 4,
    tag: 'OTT',
  },
  {
    slug: 'overseas-stock-tax-korea',
    title: '해외주식 양도소득세 직접 신고 — 5월',
    excerpt: '미국주식 22% 양도세를 홈택스에서 직접. 세무사 위탁비 10-30만원 절감.',
    minutes: 7,
    tag: '세금',
  },
  {
    slug: 'tongsin-free-registration',
    title: '통신판매업 신고 정부24 무료 5분',
    excerpt: '대행사 5-10만원 받는 신고를 직접 하면 0원.',
    minutes: 3,
    tag: '사업자',
  },
  {
    slug: 'direct-import-tax-korea',
    title: '해외직구 통관 한도 + 관세 직접 신고',
    excerpt: '$150/$200 한도 정확 계산 + 분할통관 회피 위험 + UNI-PASS 직접 통관.',
    minutes: 5,
    tag: '직구',
  },
  {
    slug: 'duns-free-route',
    title: 'DUNS 번호 무료로 받는 법 (NICE 거치지 마세요)',
    excerpt: 'Play Console 조직 전환 시 NICE 10-20만원 함정. D&B 본사 직접 무료 우회.',
    minutes: 4,
    tag: 'Play Store',
  },
  {
    slug: 'play-store-14day-bypass',
    title: 'Play Store 14일 / 12명 테스트 면제',
    excerpt: '신규 개인 계정 의무를 합법 면제 — 개인사업자 → 조직 계정 전환.',
    minutes: 6,
    tag: 'Play Store',
  },
];
