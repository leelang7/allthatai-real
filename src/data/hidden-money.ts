/**
 * 숨은 돈 찾기 — 한국 정부·금융권 공식 미환급/휴면 채널.
 *
 * 모든 카테고리는 실제 정부·공공기관 사이트 직접 연결. 어필리에이트 X.
 * 트래픽 → 광고 + AI 분석 업셀로 수익.
 */

export interface HiddenMoneySource {
  slug: string;
  category: '예금' | '보험' | '세금' | '통신' | '연금' | '카드' | '주식' | '복지' | '에너지';
  title: string;
  tagline: string;
  /** 한 사람당 평균 발견 금액 (한국 통계 기반 추정) */
  avgAmount: string;
  /** 추정 미발견 비율 */
  unclaimedRate: string;
  /** 공식 조회 사이트 */
  officialUrl: string;
  officialName: string;
  /** 신청 난이도 */
  difficulty: '쉬움' | '보통' | '복잡';
  /** 신청 소요 시간 */
  timeToFind: string;
  /** 누가 해당될 가능성 높은가 */
  whoFits: string[];
  /** 단계별 절차 */
  steps: string[];
  /** 함정·주의 */
  warnings: string[];
  /** 검색 키워드 */
  searchKeywords: string[];
}

export const hiddenMoneySources: HiddenMoneySource[] = [
  {
    slug: 'unclaimed-deposit',
    category: '예금',
    title: '휴면예금·휴면계좌',
    tagline: '5년+ 거래 없는 은행 예금. 평균 31만/계좌',
    avgAmount: '₩310,000',
    unclaimedRate: '23%',
    officialUrl: 'https://www.payinfo.or.kr',
    officialName: '계좌정보통합관리서비스 (payinfo)',
    difficulty: '쉬움',
    timeToFind: '3분',
    whoFits: ['10년+ 직장 다닌 사람', '회사 이직 잦은 사람', '학생 시절 계좌 만들고 잊은 사람', '부모님 명의'],
    steps: [
      'payinfo.or.kr 접속 → 공동인증서 로그인',
      '내 계좌 한눈에 → 전체 은행 조회',
      '비활동 계좌 (1년+ 미사용) 자동 표시',
      '계좌 이전·해지 가능. 일부 은행은 모바일에서 즉시'
    ],
    warnings: ['공동인증서 또는 금융인증서 필요', '본인 명의만 가능 (사망자 가족은 별도)', '5년 + 잔액 1만원 이상은 자동 출연되어 서민금융진흥원으로 이관'],
    searchKeywords: ['휴면예금', '휴면계좌', '잠자는 계좌', 'payinfo', '계좌정보통합관리'],
  },
  {
    slug: 'sleeping-insurance',
    category: '보험',
    title: '휴면·미청구 보험금',
    tagline: '보험사 미지급 + 만기 보험금. 평균 87만/건',
    avgAmount: '₩870,000',
    unclaimedRate: '38%',
    officialUrl: 'https://cont.insure.or.kr',
    officialName: '내보험찾아줌 (생명보험·손해보험 통합)',
    difficulty: '쉬움',
    timeToFind: '5분',
    whoFits: ['부모님이 가입했던 보험', '예전 직장 단체보험', '10년+ 가입한 생명보험', '만기 환급형 보험'],
    steps: [
      'cont.insure.or.kr 접속',
      '본인 인증 (휴대폰·공동인증서)',
      '가입된 모든 보험 + 미청구 보험금 자동 조회',
      '해당 보험사 직접 청구. 콜센터/방문/우편'
    ],
    warnings: ['만기 후 3년 지나면 청구권 소멸', '사망 보험금은 가족이 신청', '단체 보험은 회사 통해서만 가능'],
    searchKeywords: ['휴면보험금', '미청구 보험금', '내보험찾아줌', '잠자는 보험', '만기 보험'],
  },
  {
    slug: 'tax-refund',
    category: '세금',
    title: '국세 미환급금',
    tagline: '납세 후 잘못 낸 세금·환급 미수령. 평균 56만/명',
    avgAmount: '₩560,000',
    unclaimedRate: '15%',
    officialUrl: 'https://www.hometax.go.kr',
    officialName: '국세청 홈택스',
    difficulty: '쉬움',
    timeToFind: '3분',
    whoFits: ['이직·퇴직 경험자', '프리랜서·N잡러', '주택 매매 5년 내', '연말정산 누락 의심'],
    steps: [
      '홈택스 로그인 → 환급금 조회/신청',
      '미환급금 자동 표시 (최근 5년)',
      '계좌 정보 입력 → 즉시 입금',
      '소득세 연말정산 환급 + 부가세 환급 별도 조회'
    ],
    warnings: ['5년 지나면 소멸 (국세징수권 시효)', '계좌가 휴면이면 안 들어옴 → 활동 계좌로'],
    searchKeywords: ['국세 미환급금', '홈택스 환급', '세금 환급 조회', '환급금 조회', '미환급 세금'],
  },
  {
    slug: 'local-tax-refund',
    category: '세금',
    title: '지방세 미환급금',
    tagline: '취득세·재산세·자동차세 잘못 낸 것. 평균 18만/명',
    avgAmount: '₩180,000',
    unclaimedRate: '22%',
    officialUrl: 'https://www.wetax.go.kr',
    officialName: '지방세 위택스',
    difficulty: '쉬움',
    timeToFind: '3분',
    whoFits: ['차량 매매 1년 내', '주택 거래 5년 내', '사업장 이전', '주민등록 이전'],
    steps: [
      'wetax.go.kr 접속',
      '환급금 조회·신청 메뉴',
      '본인 인증 → 자동 조회',
      '계좌 등록 → 5일 내 입금'
    ],
    warnings: ['지방자치단체별로 별도 조회 필요한 경우 있음', '시효 5년'],
    searchKeywords: ['지방세 환급', '위택스 환급', '자동차세 환급', '취득세 환급'],
  },
  {
    slug: 'telecom-refund',
    category: '통신',
    title: '통신비 미환급금',
    tagline: 'SKT·KT·LGU+ 위약금 정산·과오납. 평균 23만/명',
    avgAmount: '₩230,000',
    unclaimedRate: '31%',
    officialUrl: 'https://www.smartchoice.or.kr',
    officialName: '스마트초이스 (방통위 운영)',
    difficulty: '쉬움',
    timeToFind: '5분',
    whoFits: ['통신사 변경 3년 내', '명의 변경 (가족 → 본인)', '단말기 할부 완료', '회선 해지'],
    steps: [
      'smartchoice.or.kr 또는 통신사 앱에서 미환급 조회',
      'SKT: T월드 → 환급 / KT: 마이KT → 환급 / LGU+: 마이 → 환급',
      '본인 인증 후 즉시 환급 신청',
      '계좌 입금 또는 다음 달 요금에서 차감'
    ],
    warnings: ['해지 후 3년 지나면 소멸', '소액(5천원 이하)은 자동 폐기되는 경우'],
    searchKeywords: ['통신비 미환급', '스마트초이스', 'SKT 환급', 'KT 환급', 'LGU+ 환급', '통신사 미환급'],
  },
  {
    slug: 'national-pension',
    category: '연금',
    title: '국민연금 미수령·반환일시금',
    tagline: '10년 미만 가입자 일시금. 평균 1,250만/명',
    avgAmount: '₩12,500,000',
    unclaimedRate: '12%',
    officialUrl: 'https://www.nps.or.kr',
    officialName: '국민연금공단',
    difficulty: '보통',
    timeToFind: '15분',
    whoFits: ['만 60세 도달', '국적 상실·해외 이주', '사망 (유족)', '가입기간 10년 미달인 사람'],
    steps: [
      'nps.or.kr → 내 연금 알아보기',
      '반환일시금 자격 확인 (60세 미만은 일부 사유만)',
      '신청서 작성 + 신분증 + 통장 사본',
      '지사 방문 또는 우편 신청'
    ],
    warnings: ['반환 받으면 다시 가입 불가', '추후납부 가능성 검토 후 결정'],
    searchKeywords: ['국민연금 반환일시금', '국민연금 일시금', '국민연금 미수령', 'NPS 환급'],
  },
  {
    slug: 'retirement-pension',
    category: '연금',
    title: '퇴직연금 미청구',
    tagline: '회사 퇴직연금 (DB·DC·IRP) 미수령. 평균 380만/명',
    avgAmount: '₩3,800,000',
    unclaimedRate: '18%',
    officialUrl: 'https://pension.fss.or.kr',
    officialName: '금감원 통합연금포털',
    difficulty: '보통',
    timeToFind: '10분',
    whoFits: ['퇴직 후 1년+ 지난 사람', '회사 폐업 경험자', '이직 잦은 사람'],
    steps: [
      'pension.fss.or.kr → 통합연금조회',
      '가입된 퇴직연금 자동 조회',
      '운용 금융기관에 IRP 계좌로 이전 신청',
      '55세 이후 수령 (조기 수령 시 세금 큼)'
    ],
    warnings: ['IRP 계좌 없으면 만들어야 함', '55세 전 수령은 기타소득세 16.5%'],
    searchKeywords: ['퇴직연금 미청구', '통합연금포털', 'IRP 조회', '퇴직금 조회'],
  },
  {
    slug: 'card-points',
    category: '카드',
    title: '신용카드 포인트',
    tagline: '카드사별 포인트·캐시백·연회비 환급. 평균 38만/년',
    avgAmount: '₩380,000',
    unclaimedRate: '45%',
    officialUrl: 'https://card.co.kr',
    officialName: '여신금융협회 카드포인트 통합조회',
    difficulty: '쉬움',
    timeToFind: '3분',
    whoFits: ['카드 2개 이상 보유', '카드사 변경 경험', '5년+ 카드 사용자', '캐시백 카드 사용자'],
    steps: [
      'card.co.kr 접속',
      '본인 인증 → 전체 카드사 포인트 한 번에 조회',
      '계좌로 이전 신청 (1포인트 = 1원, 1천원 이상)',
      '카드사 앱에서도 가능'
    ],
    warnings: ['5년 안 쓰면 소멸 (카드사별 다름)', '제휴 포인트는 별도 (OK캐쉬백·해피포인트 등)'],
    searchKeywords: ['카드 포인트 통합조회', '카드포인트 환급', '여신금융협회 포인트', '카드 포인트 현금'],
  },
  {
    slug: 'integrated-points',
    category: '카드',
    title: '제휴 포인트·멤버십',
    tagline: 'OK캐쉬백·해피포인트·CJ ONE 등. 평균 12만/명',
    avgAmount: '₩120,000',
    unclaimedRate: '52%',
    officialUrl: 'https://www.okcashbag.com',
    officialName: 'OK캐쉬백 (SK)',
    difficulty: '쉬움',
    timeToFind: '5분',
    whoFits: ['편의점·주유소·마트 자주 이용', '카드 결제 시 적립 동의한 사람'],
    steps: [
      'OK캐쉬백 / 해피포인트 / CJ ONE / L포인트 / 카카오뱅크 포인트 각 사이트 조회',
      '본인 인증 후 잔액 확인',
      '캐쉬백·페이로 전환 또는 가맹점 사용',
      '만료 임박 자동 알림 설정'
    ],
    warnings: ['보통 2-3년 미사용 시 소멸', '회원 탈퇴하면 즉시 소멸'],
    searchKeywords: ['OK캐쉬백', '해피포인트', 'CJ ONE', '제휴 포인트', '멤버십 포인트'],
  },
  {
    slug: 'airline-miles',
    category: '카드',
    title: '항공 마일리지',
    tagline: '대한항공·아시아나 만료 임박. 평균 28만/계정',
    avgAmount: '₩280,000',
    unclaimedRate: '35%',
    officialUrl: 'https://www.koreanair.com',
    officialName: '대한항공 스카이패스 / 아시아나 클럽',
    difficulty: '쉬움',
    timeToFind: '5분',
    whoFits: ['카드 마일리지 적립', '해외 출장 1회+ 경험', '제휴 카드 5년+ 사용'],
    steps: [
      '대한항공 koreanair.com / 아시아나 flyasiana.com 로그인',
      '마일리지 잔액 + 만료 임박 확인',
      '항공권 발권 / 좌석 업그레이드 / 제휴사 사용',
      '소멸 임박 시 쇼핑·호텔 결제로 전환'
    ],
    warnings: ['10년 만료 (2023년 1월 1일 적립분부터)', '항공권 발권은 보통 3-6개월 전 예약 필요', '제휴사 전환은 환율 손해 큼'],
    searchKeywords: ['대한항공 마일리지', '아시아나 마일리지', '항공 마일리지 사용', '마일리지 소멸'],
  },
  {
    slug: 'electricity-refund',
    category: '에너지',
    title: '한전 전기료 과오납·할인',
    tagline: '에너지 캐시백·여름·복지할인 미수령. 평균 8만/년',
    avgAmount: '₩80,000',
    unclaimedRate: '60%',
    officialUrl: 'https://en-ter.co.kr',
    officialName: '한전 에너지 캐시백',
    difficulty: '보통',
    timeToFind: '10분',
    whoFits: ['아파트·주택 거주', '전기료 절감 가구', '다자녀·장애·기초생활 수급'],
    steps: [
      'en-ter.co.kr 접속',
      '에너지 캐시백 신청 (전월 대비 절감 시 ₩30-200/kWh 환급)',
      '한전 ON 앱에서 복지 할인 신청',
      '여름철 누진제 한시 완화 자동 적용'
    ],
    warnings: ['에너지 캐시백은 사전 신청 필수', '복지 할인은 자격 증빙 필요'],
    searchKeywords: ['전기료 할인', '한전 캐시백', '에너지 캐시백', '전기료 환급'],
  },
  {
    slug: 'stock-dividend',
    category: '주식',
    title: '주식 배당금·미수령 주식',
    tagline: '상속·매각 후 잊은 주식·배당. 평균 95만/건',
    avgAmount: '₩950,000',
    unclaimedRate: '8%',
    officialUrl: 'https://www.fss.or.kr',
    officialName: '금감원 미수령 주식·배당금 통합조회',
    difficulty: '복잡',
    timeToFind: '20분',
    whoFits: ['상속 받은 적 있는 사람', '구사주(舊株) 보유자', '90-2000년대 주식 한 적 있음'],
    steps: [
      '금감원 통합조회 시스템 → 본인 인증',
      '명의 변경 안 된 주식 + 미수령 배당 조회',
      '예탁결제원·발행회사·증권사 삼중 절차',
      '상속이면 가족관계증명서 추가 필요'
    ],
    warnings: ['시효 10년 (배당금)', '상속분 명의 변경은 변호사 또는 법무사 권장'],
    searchKeywords: ['미수령 주식', '미수령 배당금', '구사주', '잠자는 주식'],
  },
  {
    slug: 'welfare-missing',
    category: '복지',
    title: '복지 미수령 (정부24)',
    tagline: '기초연금·장애수당·아동수당 미신청. 평균 50만/월',
    avgAmount: '₩500,000',
    unclaimedRate: '14%',
    officialUrl: 'https://www.gov.kr',
    officialName: '정부24 복지로',
    difficulty: '보통',
    timeToFind: '15분',
    whoFits: ['만 65세+', '장애 등록자', '미성년 자녀', '저소득 가구'],
    steps: [
      '복지로 bokjiro.go.kr → 맞춤형 복지 검색',
      '본인 정보 입력 → 자격 가능 복지 자동 추출',
      '복지 신청 (온라인·동주민센터·우편)',
      '소급 지급 가능한 항목 별도 확인'
    ],
    warnings: ['일부 복지는 사전 신청만 가능 (소급 X)', '소득·재산 기준 충족 필수'],
    searchKeywords: ['복지 미수령', '복지로', '정부24 복지', '기초연금', '맞춤형 복지'],
  },
];

export function findHiddenMoney(slug: string) {
  return hiddenMoneySources.find((h) => h.slug === slug);
}

export const totalAvgRecovery = hiddenMoneySources
  .reduce((sum, h) => sum + parseInt(h.avgAmount.replace(/[^\d]/g, ''), 10), 0);
