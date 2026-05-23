/**
 * 유료 부동산 서비스 카탈로그.
 *
 * 진짜 매출 발생 채널 (광고·트래픽 X).
 * 입금: 카카오뱅크 / 토스뱅크 계좌 (계좌번호는 env로).
 * 자동 응답: Resend API 또는 EmailJS (사용자 등록 후 활성).
 */

export interface Service {
  slug: string;
  title: string;
  tagline: string;
  /** 단가 (KRW 정수) */
  priceKrw: number;
  /** 표시 가격 */
  priceLabel: string;
  /** 단가 유형 */
  priceType: '건당' | '월정기' | '시간당' | '+수수료';
  /** 어떤 사람이 사야 하나 */
  forWhom: string[];
  /** 처리 시간 */
  deliveryTime: string;
  /** 자동화 비율 */
  automationPct: number;
  /** 무엇을 받는가 (deliverables) */
  deliverables: string[];
  /** 활용하는 AI/데이터 */
  poweredBy: string[];
  /** 차별화 포인트 */
  uniqueValue: string;
  /** 환불 정책 */
  refund: string;
  /** 카테고리 */
  category: '전세 안전' | '임대인 도구' | '매수·매도' | '분쟁·법무' | '관리·구독';
  /** 강조 */
  featured: boolean;
}

export const services: Service[] = [
  {
    slug: 'jeonse-full-review',
    title: '전세 종합 검토 (AI + 사람)',
    tagline: '등기부·계약서·시세·임대인 4가지 한 번에. 변호사급 종합 의견',
    priceKrw: 99000,
    priceLabel: '₩99,000',
    priceType: '건당',
    forWhom: [
      '전세 계약 앞두고 있는 임차인',
      '이전 보증금 분쟁 트라우마 있는 사람',
      '깡통전세 의심 매물 확인',
      'HUG 보증 가입 전 사전 점검'
    ],
    deliveryTime: '24시간 (긴급은 6시간 ₩30K 추가)',
    automationPct: 80,
    deliverables: [
      '등기부등본 AI 자동 분석 (위험 점수 0-100)',
      '계약서 함정 조항 자동 추출 (10가지 카테고리)',
      '주변 시세 vs 보증금 비율 분석 (국토부 실거래가)',
      '임대인 사업자·세금 체납 확인',
      '깡통전세 위험도 종합 점수',
      'PDF 종합 보고서 (12-15페이지)',
      '권장 조치 + 협상 포인트',
      '필요 시 30분 1:1 통화 (선택)'
    ],
    poweredBy: ['AI 등기부 분석', 'AI 계약서 함정', 'AI 매물 사기', '국토부 실거래가', '국세청 사업자 진위'],
    uniqueValue: '대행사·법무사 ₩200K 짜리를 AI로 ₩99K. 4개 데이터 1건 분석에 한 번에.',
    refund: '오탐 발견 시 100% 환불 + ₩50K 추가 보상',
    category: '전세 안전',
    featured: true,
  },
  {
    slug: 'tenant-verify',
    title: '임차인 신용·전적 검증',
    tagline: '임대인 입장에서 새 임차인 사전 검증. 사기 임차인 차단',
    priceKrw: 29000,
    priceLabel: '₩29,000',
    priceType: '건당',
    forWhom: [
      '임대 매물 가진 임대인',
      '월세 미납 이력 의심',
      '신규 다가구·다세대 매물 임대',
      '오피스텔·원룸 임대업자'
    ],
    deliveryTime: '1시간 (자동)',
    automationPct: 95,
    deliverables: [
      '주민번호/성명 기반 사기 신고 이력 검색',
      '사업자 등록 시 사업자 진위 + 휴폐업 상태',
      '대법원 등기 사항 (가압류·소송 이력)',
      '신용정보회사 NICE/KCB 연계 가능 (옵션 +₩20K)',
      '월세 연체 이력 추정 (공개 자료 기반)',
      '종합 신뢰도 점수 + 권장 보증금 비율'
    ],
    poweredBy: ['국세청 사업자 진위 API', '대법원 인터넷등기소', 'AI 위험 패턴 분석'],
    uniqueValue: '사람이 확인하려면 5곳 따로 조회 → 1번에 통합. 임차인 사기 사전 차단.',
    refund: '미환급 (자동 처리)',
    category: '임대인 도구',
    featured: true,
  },
  {
    slug: 'property-coaching',
    title: '매수·매도 1:1 협상 코칭',
    tagline: '매물·시세·세금·협상 대본 종합. 30분 통화 + 보고서',
    priceKrw: 199000,
    priceLabel: '₩199,000',
    priceType: '건당',
    forWhom: [
      '아파트·빌라 매수 첫 경험',
      '1주택 갈아타기 (양도세 최적화)',
      '다주택 정리 (세금 시뮬)',
      '협상에서 항상 손해 보는 사람'
    ],
    deliveryTime: '48시간 (사전 분석) + 협의 통화',
    automationPct: 50,
    deliverables: [
      '대상 매물 시세 정밀 분석 (실거래 + 주변 거래)',
      '예상 보유 시 세금 시뮬레이션 (취득세·재산세·종부세·양도세)',
      '협상 시작가·목표가·한계가 계산',
      '협상 대본 (단계별 대사 + 반박 시나리오)',
      '30분 1:1 통화 (전화 또는 화상)',
      '계약서 검토 (별도 옵션)',
      '필요 시 변호사 연결 (별도 비용)'
    ],
    poweredBy: ['AI 부동산 라이프사이클', 'AI 협상 대본', 'AI 시장 트렌드', '국토부 실거래가'],
    uniqueValue: '부동산 사장님 ₩300K~500K 컨설팅을 ₩199K. AI가 미리 다 분석 + 본인이 핵심만 통화.',
    refund: '결과 만족 안 시 50% 환불',
    category: '매수·매도',
    featured: true,
  },
  {
    slug: 'landlord-monitor',
    title: '건물주 종합 모니터링',
    tagline: '계약 만료·세금·시세 자동 알림. 호당 ₩9,000/월',
    priceKrw: 9000,
    priceLabel: '₩9,000/호/월',
    priceType: '월정기',
    forWhom: [
      '다주택 임대인 (3호 이상)',
      '오피스텔·원룸 다수 보유',
      '계약 만료 놓치는 임대인',
      '세금 일정 관리 어려운 사람'
    ],
    deliveryTime: '즉시 (가입 즉시 시작)',
    automationPct: 95,
    deliverables: [
      '계약 만료 60일·30일·7일 전 자동 알림',
      '월세 입금 누락 알림 (계좌 연동)',
      '재산세·종부세 납부 일정 알림',
      '주변 시세 변동 월간 리포트',
      '임차인 갱신요구권 시기 자동 추적',
      '계약 갱신·해지 양식 자동 생성',
      'AI 임대료 인상 가능 범위 (법정 5% 한도 자동 계산)'
    ],
    poweredBy: ['국토부 실거래가', '국세청 알림 API', 'AI 시장 트렌드', '주임법 자동 적용'],
    uniqueValue: '5호 가진 임대인 = 월 ₩45K. 1년 ₩540K. 한 번의 계약 만료 놓침 = 손실 수백만',
    refund: '첫 달 100% 환불',
    category: '관리·구독',
    featured: true,
  },
  {
    slug: 'dispute-letter',
    title: '분쟁 내용증명 + 변호사 연결',
    tagline: '보증금 미반환·수리 미이행 등 정식 공문 + 필요 시 변호사 연결',
    priceKrw: 30000,
    priceLabel: '₩30,000',
    priceType: '+수수료',
    forWhom: [
      '보증금 반환 미루는 임대인 상대',
      '월세 인상 거부',
      '계약 갱신 거절당한 임차인',
      '수리 의무 불이행 분쟁',
      '계약 파기 분쟁'
    ],
    deliveryTime: '2시간 (내용증명 자동) + 변호사 연결 시 1-3일',
    automationPct: 70,
    deliverables: [
      'AI 내용증명 자동 작성 (주임법·민법 조항 인용)',
      '발송 방법 안내 (우체국 내용증명 절차)',
      '미이행 시 다음 조치 안내 (임차권 등기 등)',
      '증거 보존 가이드',
      '필요 시 변호사 연결 (수임료의 10% 수수료)',
      '소송 비용 시뮬레이션'
    ],
    poweredBy: ['AI 임차인 공문 작성', 'AI 분쟁 해결 가이드', '법률구조공단 132 연계'],
    uniqueValue: '변호사 ₩100K-300K 상담을 ₩30K에 1차 처리. 90%는 내용증명만으로 해결됨.',
    refund: '오류 시 ₩30K 환불',
    category: '분쟁·법무',
    featured: false,
  },
  {
    slug: 'building-check',
    title: '건축물대장·위반 종합 조회',
    tagline: '불법 증축·용도 위반·하자 사전 점검',
    priceKrw: 19000,
    priceLabel: '₩19,000',
    priceType: '건당',
    forWhom: [
      '오피스텔·원룸·고시원 임대 의심',
      '불법 증축 매물 가능성',
      '용도 변경 매물 확인 (주거 vs 근생)'
    ],
    deliveryTime: '1시간',
    automationPct: 90,
    deliverables: [
      '국토부 건축물대장 자동 조회',
      '위반 건축물 등재 여부 확인',
      '용도·구조·면적 vs 실제 매물 비교',
      '주차 대수 vs 세대 수 적정성',
      '소방·일조권 등 잠재 분쟁 요소'
    ],
    poweredBy: ['국토부 건축물대장 API'],
    uniqueValue: '건축사·법무사 거치면 ₩50K-100K. 자동화로 ₩19K.',
    refund: '데이터 없을 시 100% 환불',
    category: '전세 안전',
    featured: false,
  },
  {
    slug: 'contract-review-only',
    title: '계약서만 검토',
    tagline: '계약서 함정 조항·누락 조항·수정 제안',
    priceKrw: 39000,
    priceLabel: '₩39,000',
    priceType: '건당',
    forWhom: [
      '계약서 받았는데 사인 전 확인하고 싶은 사람',
      '특약사항 함정 의심',
      '매매·임대·근저당 모든 계약서'
    ],
    deliveryTime: '2시간',
    automationPct: 85,
    deliverables: [
      'AI 계약서 자동 분석 (10가지 함정 카테고리)',
      '누락된 필수 조항 추출',
      '수정·삭제·추가 권장 (구체 문구)',
      '공정성 점수 0-100',
      '계약 전 협상 포인트'
    ],
    poweredBy: ['AI 계약서 함정 탐지'],
    uniqueValue: '변호사 ₩100K 검토를 ₩39K. 24시간 안에.',
    refund: '오탐 시 100%',
    category: '전세 안전',
    featured: false,
  },
];

export function findService(slug: string) {
  return services.find((s) => s.slug === slug);
}
