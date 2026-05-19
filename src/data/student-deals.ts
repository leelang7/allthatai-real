/**
 * 학생 할인 — AI·SaaS·툴 최신 (2026-05 기준).
 *
 * 한국 학생 (.ac.kr) 또는 GitHub Student Pack·SheerID 등으로 가능한 것만.
 * 출시 시점 ≠ 현재 상태. 자주 바뀜 → "lastVerified" 명시.
 */

export interface StudentDeal {
  slug: string;
  category: 'AI 챗봇' | 'AI 도구' | '코딩' | '디자인' | '음악·미디어' | '학습·생산성' | '하드웨어' | '검색';
  title: string;
  provider: string;
  /** 한 줄 가치 */
  tagline: string;
  /** 정가 */
  normalPrice: string;
  /** 학생 가격 */
  studentPrice: string;
  /** 할인율 또는 무료 */
  discount: string;
  /** 인증 방법 */
  verification: 'GitHub Student Pack' | 'SheerID' | '.ac.kr 이메일' | '학교 ISIC' | '자체 학교 인증' | '캠퍼스 라이선스';
  /** 한국 학생 사용 가능 여부 */
  koreaOk: boolean;
  /** 가입 페이지 */
  signupUrl: string;
  /** 추천 점수 1-10 */
  recommend: number;
  /** 마지막 검증 */
  lastVerified: string;
  /** 함정·주의 */
  pitfalls: string[];
  /** 졸업 후 어떻게 */
  afterGraduation: string;
  /** 신청 단계 */
  steps: string[];
  /** 어떤 학생에게 좋은가 */
  bestFor: string[];
}

export const studentDeals: StudentDeal[] = [
  {
    slug: 'perplexity-pro',
    category: 'AI 챗봇',
    title: 'Perplexity Pro',
    provider: 'Perplexity AI',
    tagline: '한국 대학 캠퍼스 무료 1년 (2024-2025 진행 중). 그 외엔 SheerID 시도',
    normalPrice: '$20/월 (₩27,500)',
    studentPrice: '₩0 (캠퍼스 라이선스) / 시범 50%',
    discount: '캠퍼스 무료 또는 시범 할인',
    verification: '캠퍼스 라이선스',
    koreaOk: true,
    signupUrl: 'https://perplexity.ai/students',
    recommend: 9,
    lastVerified: '2026-05',
    pitfalls: [
      '한국 캠퍼스 무료는 협약된 대학만 (서울대·KAIST·연세·고려 등 시점별 변동)',
      '학교 협약 없으면 SheerID 인증 시도하되 한국 학교 일부만 인식',
      '캠퍼스 무료도 1년 한정 — 졸업 또는 만료 시 정가',
      'Pro 검색은 일 600회 한도'
    ],
    afterGraduation: '갱신 시 정가. Comet Pro 또는 GitHub Student Pack 잔여 기간 활용',
    steps: [
      'perplexity.ai/students 접속',
      '학교 .ac.kr 이메일로 가입',
      '학교 인증 또는 SheerID 인증',
      '협약 대학이면 즉시 Pro 활성',
      '비협약 대학은 시범 할인 신청 폼'
    ],
    bestFor: ['논문 검색', '레퍼런스 정리', '실시간 정보 조회', 'AI 검색 익숙해지기'],
  },
  {
    slug: 'chatgpt-plus-student',
    category: 'AI 챗봇',
    title: 'ChatGPT Plus 학생 할인',
    provider: 'OpenAI',
    tagline: '미국·캐나다 학생 한정 시범 (50% 또는 무료). 한국 X',
    normalPrice: '$20/월 (₩27,500)',
    studentPrice: '시범국 한정 50%',
    discount: '한국 X (2026-05 기준)',
    verification: 'SheerID',
    koreaOk: false,
    signupUrl: 'https://openai.com/students',
    recommend: 4,
    lastVerified: '2026-05',
    pitfalls: [
      '한국 학생 대상 공식 학생 할인 없음 (2026-05 시점)',
      '미국 .edu 이메일이라도 결제 카드 미국 발급 필요한 경우',
      '시범 프로그램이라 갑자기 종료될 수 있음',
      'ChatGPT Pro $200/월은 학생 할인 X'
    ],
    afterGraduation: '갱신 정가',
    steps: [
      'openai.com/students 확인 (한국 안내 없음)',
      '미국 .edu 이메일 보유 시만 시도',
      'Perplexity·Claude·Gemini가 한국 학생에게 더 현실적'
    ],
    bestFor: ['미국·캐나다 거주 한국 유학생'],
  },
  {
    slug: 'claude-edu',
    category: 'AI 챗봇',
    title: 'Claude (Anthropic)',
    provider: 'Anthropic',
    tagline: '학교 단위 Education 라이선스. 개인 학생 할인 X',
    normalPrice: '$20/월 (Pro)',
    studentPrice: '학교 협약 시 무료',
    discount: '개인 학생 할인 없음',
    verification: '자체 학교 인증',
    koreaOk: true,
    signupUrl: 'https://www.anthropic.com/education',
    recommend: 5,
    lastVerified: '2026-05',
    pitfalls: [
      '개인 학생 할인 없음 → 학교가 단체 도입해야 함',
      '한국 협약 대학 매우 적음',
      'Anthropic Console (API) 별도 — 학생 크레딧 없음'
    ],
    afterGraduation: '학교 라이선스 종료',
    steps: [
      '학교 IT 부서에 Claude for Education 도입 문의',
      '한국 대학 거의 도입 X',
      '개인은 Claude.ai 무료 사용량으로 충분'
    ],
    bestFor: ['학교가 도입한 학생'],
  },
  {
    slug: 'gemini-students',
    category: 'AI 챗봇',
    title: 'Gemini Advanced 학생 (시범)',
    provider: 'Google',
    tagline: '시범 국가 학생 1년 무료. 한국 미적용',
    normalPrice: '$19.99/월',
    studentPrice: '시범국 1년 무료',
    discount: '한국 미적용 (2026-05)',
    verification: 'SheerID',
    koreaOk: false,
    signupUrl: 'https://one.google.com/about/student-promo',
    recommend: 4,
    lastVerified: '2026-05',
    pitfalls: [
      '미국·영국 등 일부 국가만',
      'Google One AI Premium = Gemini Advanced 동일',
      'VPN으로 우회 시 정지 위험'
    ],
    afterGraduation: '갱신 정가',
    steps: [
      'one.google.com/about/student-promo 확인',
      '한국 미적용. Gemini API Free Tier로 대체',
      'aistudio.google.com에서 무료 사용 가능'
    ],
    bestFor: ['시범국 거주 학생'],
  },
  {
    slug: 'cursor-students',
    category: '코딩',
    title: 'Cursor Pro Student',
    provider: 'Cursor (Anysphere)',
    tagline: '학생 무료 1년 (.edu·.ac.kr OK). 강력 추천',
    normalPrice: '$20/월 (₩27,500)',
    studentPrice: '₩0 / 1년',
    discount: '100% (1년)',
    verification: '.ac.kr 이메일',
    koreaOk: true,
    signupUrl: 'https://www.cursor.com/students',
    recommend: 10,
    lastVerified: '2026-05',
    pitfalls: [
      '.ac.kr·.edu 이메일 필수',
      '졸업 후 갱신 X (학생 가격 종료)',
      'GPT-4·Claude 무제한이지만 일부 모델은 분당 제한'
    ],
    afterGraduation: '정가 $20/월. 또는 Cursor Free (무료 한도) 회귀',
    steps: [
      'cursor.com/students',
      '.ac.kr 이메일 입력',
      '이메일 인증 → 즉시 Pro 활성',
      'macOS·Windows·Linux 모두'
    ],
    bestFor: ['컴공·코딩 전공·부전공', 'AI 코딩 익숙해지기', 'GPT/Claude 무제한 필요'],
  },
  {
    slug: 'github-copilot-students',
    category: '코딩',
    title: 'GitHub Copilot Pro',
    provider: 'GitHub',
    tagline: 'GitHub Student Pack 가입 시 평생(?) 무료',
    normalPrice: '$10/월',
    studentPrice: '₩0',
    discount: '100%',
    verification: 'GitHub Student Pack',
    koreaOk: true,
    signupUrl: 'https://education.github.com/pack',
    recommend: 10,
    lastVerified: '2026-05',
    pitfalls: [
      'Student Pack 인증 매년 재인증 필요',
      '졸업 후 자동 종료',
      'Copilot Business·Enterprise는 별도'
    ],
    afterGraduation: '$10/월 정가 또는 무료 한도 (2K 자동완성/월 + 50 chat/월)',
    steps: [
      'education.github.com/pack 접속',
      '학교 인증 (학생증 사진 또는 .ac.kr 이메일)',
      'Student Pack 활성 후 Copilot 자동 무료',
      'VS Code/Cursor/JetBrains에 GitHub 로그인'
    ],
    bestFor: ['코딩 전공 학생', '대학 프로젝트', '인디 앱 개발'],
  },
  {
    slug: 'github-student-pack',
    category: '학습·생산성',
    title: 'GitHub Student Developer Pack',
    provider: 'GitHub',
    tagline: '100+ 도구 무료 (Copilot·DigitalOcean $200·.me 도메인·JetBrains 등)',
    normalPrice: '각 $5-$200/월',
    studentPrice: '₩0',
    discount: '100%',
    verification: 'GitHub Student Pack',
    koreaOk: true,
    signupUrl: 'https://education.github.com/pack',
    recommend: 10,
    lastVerified: '2026-05',
    pitfalls: [
      '학생증 사진 인증 (한국 학생증 OK)',
      '1년마다 재인증',
      '각 도구별 별도 신청 (자동 X)',
      '일부 항목은 변동 (수시로 추가·제거됨)'
    ],
    afterGraduation: 'Pack 종료 — 도구별로 학생 가격 종료',
    steps: [
      'education.github.com/pack',
      'GitHub 계정 + 학교 이메일',
      '학생증 사진 업로드 (전체 이름·날짜 보이게)',
      '1-3일 승인',
      '승인 후 100+ 도구 페이지에서 각각 활성화'
    ],
    bestFor: ['모든 대학·대학원생', '인디 개발자 풀스택', '학습 + 실제 프로젝트'],
  },
  {
    slug: 'jetbrains-students',
    category: '코딩',
    title: 'JetBrains All Products Pack',
    provider: 'JetBrains',
    tagline: 'IntelliJ·PyCharm·WebStorm 등 + AI Assistant 학생 무료',
    normalPrice: '$28-249/년',
    studentPrice: '₩0',
    discount: '100%',
    verification: '.ac.kr 이메일',
    koreaOk: true,
    signupUrl: 'https://www.jetbrains.com/community/education/',
    recommend: 9,
    lastVerified: '2026-05',
    pitfalls: [
      '비상업적 사용만 (수익 발생 프로젝트 안 됨)',
      '매년 재인증',
      'AI Assistant는 별도 활성화'
    ],
    afterGraduation: '졸업 후 1년 50% 할인 (Continuity License)',
    steps: [
      'jetbrains.com/community/education',
      '.ac.kr 이메일로 신청',
      'JB 계정 생성 + 학생 라이선스 활성',
      'Toolbox 또는 개별 IDE 다운로드'
    ],
    bestFor: ['Java·Python·Kotlin·Go 학생', '대학 프로젝트', '컴공 시험'],
  },
  {
    slug: 'figma-edu',
    category: '디자인',
    title: 'Figma Education',
    provider: 'Figma',
    tagline: '전체 기능 (Professional + Dev Mode + FigJam) 학생 무료',
    normalPrice: '$15/월',
    studentPrice: '₩0',
    discount: '100%',
    verification: 'SheerID',
    koreaOk: true,
    signupUrl: 'https://www.figma.com/education/',
    recommend: 9,
    lastVerified: '2026-05',
    pitfalls: [
      'SheerID 인증 (학생증 사진 또는 .ac.kr)',
      '2년 후 재인증',
      '졸업 후 무료 Starter 또는 Pro $15/월'
    ],
    afterGraduation: 'Free Starter (개인 3 파일 한도) 또는 정가',
    steps: [
      'figma.com/education 접속',
      'SheerID 인증',
      '학생증·재학증명서 사진 업로드',
      '1-3일 승인'
    ],
    bestFor: ['디자인·UI·UX 전공', 'PM·기획자', '프로토타입 작업'],
  },
  {
    slug: 'canva-pro-edu',
    category: '디자인',
    title: 'Canva Pro for Education',
    provider: 'Canva',
    tagline: '학생·교사 무료 (개인 학생은 약간 변동)',
    normalPrice: '₩14,900/월',
    studentPrice: '₩0 (교사·학교 인증 시)',
    discount: '100% (학교) / 50% (개인 시범)',
    verification: '학교 ISIC',
    koreaOk: true,
    signupUrl: 'https://www.canva.com/education/',
    recommend: 7,
    lastVerified: '2026-05',
    pitfalls: [
      '교사·학교 등록은 100%, 개인 학생은 인증 까다로움',
      'ISIC 카드 또는 학교 인증 필요',
      'Pro 디자인 다운로드 후에는 비상업 사용 OK',
      '상업적 사용 시 라이선스 별도 확인'
    ],
    afterGraduation: '정가 ₩14,900/월',
    steps: [
      'canva.com/education',
      '교사면 학교 도메인 인증',
      '학생은 ISIC 카드 또는 학교 인증',
      'Pro 기능 즉시 활성'
    ],
    bestFor: ['디자인 비전공', '발표 자료', 'SNS 콘텐츠'],
  },
  {
    slug: 'adobe-cc-students',
    category: '디자인',
    title: 'Adobe Creative Cloud',
    provider: 'Adobe',
    tagline: '학생·교사 60-65% 할인. 첫 해 ₩23,100/월',
    normalPrice: '₩66,000/월',
    studentPrice: '₩23,100/월 (첫 해)',
    discount: '~65%',
    verification: 'SheerID',
    koreaOk: true,
    signupUrl: 'https://www.adobe.com/kr/creativecloud/buy/students.html',
    recommend: 7,
    lastVerified: '2026-05',
    pitfalls: [
      '첫 해 60% 할인, 두 번째 해부터 ₩34,100/월 (45% 할인)',
      'SheerID 인증 (실패 시 학생증 직접 업로드)',
      '졸업 후에도 학생 가격 유지 시도 → 실패하면 정가',
      '연 결제만 가능 (월 결제 X)'
    ],
    afterGraduation: '정가 ₩66,000/월. 또는 Affinity·Photopea 무료 대안',
    steps: [
      'adobe.com/kr/creativecloud/buy/students.html',
      'SheerID 인증',
      '학생증·재학증명서 업로드',
      '1-2일 승인 후 결제'
    ],
    bestFor: ['포토샵·일러스트레이터 필수 전공', '영상 편집 (Premiere)', '인디자인'],
  },
  {
    slug: 'notion-edu',
    category: '학습·생산성',
    title: 'Notion + AI Education',
    provider: 'Notion',
    tagline: '학생·교사 Plus + AI 무료 (.ac.kr 이메일)',
    normalPrice: '$10/월 + $10 (AI) = $20',
    studentPrice: '₩0',
    discount: '100%',
    verification: '.ac.kr 이메일',
    koreaOk: true,
    signupUrl: 'https://www.notion.com/product/notion-for-education',
    recommend: 9,
    lastVerified: '2026-05',
    pitfalls: [
      '.edu·.ac.kr 이메일 필수',
      '졸업 또는 이메일 만료 시 강제 다운그레이드',
      '팀 워크스페이스는 별도 (개인 워크스페이스만 학생 가격)'
    ],
    afterGraduation: '정가 또는 Free Plan (블록 무제한 + AI 한도)',
    steps: [
      'notion.com/product/notion-for-education',
      '.ac.kr 이메일로 가입 또는 변경',
      '교육 이메일 인증 → 즉시 Plus + AI'
    ],
    bestFor: ['공부 노트', '프로젝트 관리', '논문 정리', 'AI 자동 요약'],
  },
  {
    slug: 'microsoft-365-edu',
    category: '학습·생산성',
    title: 'Microsoft 365 + Copilot Education',
    provider: 'Microsoft',
    tagline: 'Word·Excel·PowerPoint·OneDrive 1TB + Copilot Pro 학생 무료',
    normalPrice: '₩89,000/년',
    studentPrice: '₩0',
    discount: '100%',
    verification: '.ac.kr 이메일',
    koreaOk: true,
    signupUrl: 'https://www.microsoft.com/ko-kr/education/products/office',
    recommend: 9,
    lastVerified: '2026-05',
    pitfalls: [
      '학교 .ac.kr 이메일 필수',
      'Copilot Pro 통합은 학교 라이선스 따라 다름',
      '졸업 후 즉시 종료'
    ],
    afterGraduation: '개인 Family $99/년 6명 공유 또는 Free Web',
    steps: [
      'microsoft.com/ko-kr/education/products/office',
      '.ac.kr 이메일 입력 → 자동 인증',
      'Word·Excel·PowerPoint 등 다운로드',
      'Teams·OneDrive 1TB 즉시'
    ],
    bestFor: ['과제·논문 작성 모든 학생', '학교 메일 통합', '팀 협업'],
  },
  {
    slug: 'spotify-student',
    category: '음악·미디어',
    title: 'Spotify Premium Student',
    provider: 'Spotify',
    tagline: '월 ₩6,900 (50% 할인)',
    normalPrice: '₩13,900/월',
    studentPrice: '₩6,900/월',
    discount: '50%',
    verification: 'SheerID',
    koreaOk: true,
    signupUrl: 'https://www.spotify.com/kr-ko/student/',
    recommend: 8,
    lastVerified: '2026-05',
    pitfalls: [
      '4년 한정 (졸업 후 정가)',
      'SheerID 인증',
      '한국에서는 음원 라이선스로 일부 곡 제한'
    ],
    afterGraduation: '정가 ₩13,900/월',
    steps: [
      'spotify.com/kr-ko/student',
      'SheerID 인증',
      '학생증 또는 .ac.kr 이메일',
      '즉시 50% 할인 적용'
    ],
    bestFor: ['해외 팝·인디 자주 듣는 학생', '공부 BGM'],
  },
  {
    slug: 'apple-music-student',
    category: '음악·미디어',
    title: 'Apple Music Student',
    provider: 'Apple',
    tagline: '월 ₩5,500 + Apple TV+ 포함',
    normalPrice: '₩10,900/월',
    studentPrice: '₩5,500/월',
    discount: '50% + Apple TV+ 무료',
    verification: 'UNiDAYS',
    koreaOk: true,
    signupUrl: 'https://www.apple.com/kr/apple-music/student/',
    recommend: 8,
    lastVerified: '2026-05',
    pitfalls: [
      '4년 한정',
      'UNiDAYS 인증 (한국 학교 일부만 인식)',
      '학생증 사진으로 대체 가능'
    ],
    afterGraduation: '정가',
    steps: [
      'apple.com/kr/apple-music/student',
      'UNiDAYS 인증',
      '실패 시 학생증 사진'
    ],
    bestFor: ['Apple 생태계', 'AirPods 사용자'],
  },
  {
    slug: 'youtube-premium-student',
    category: '음악·미디어',
    title: 'YouTube Premium Student',
    provider: 'Google',
    tagline: '월 ₩6,900 + YouTube Music 포함',
    normalPrice: '₩14,900/월',
    studentPrice: '₩6,900/월',
    discount: '54%',
    verification: 'SheerID',
    koreaOk: true,
    signupUrl: 'https://www.youtube.com/premium/student',
    recommend: 9,
    lastVerified: '2026-05',
    pitfalls: [
      '4년 한정',
      '매년 SheerID 재인증',
      '한국 대학 다수 SheerID 등록되어 있음'
    ],
    afterGraduation: '정가 ₩14,900/월',
    steps: [
      'youtube.com/premium/student',
      'SheerID 인증',
      '학교 검색 (.ac.kr)',
      '즉시 할인'
    ],
    bestFor: ['공부 영상·강의', 'YouTube Music', '광고 X'],
  },
  {
    slug: 'linkedin-learning',
    category: '학습·생산성',
    title: 'LinkedIn Premium + Learning',
    provider: 'Microsoft',
    tagline: 'GitHub Student Pack 통해 1년 무료',
    normalPrice: '$29.99/월',
    studentPrice: '₩0 / 1년',
    discount: '100%',
    verification: 'GitHub Student Pack',
    koreaOk: true,
    signupUrl: 'https://education.github.com/pack',
    recommend: 7,
    lastVerified: '2026-05',
    pitfalls: [
      'Student Pack 활성화 후 LinkedIn 페이지에서 별도 활성',
      '1년 후 자동 종료 (재인증 가능)',
      '한국 LinkedIn은 미국·유럽보다 콘텐츠 적음'
    ],
    afterGraduation: '정가 $29.99/월',
    steps: [
      'GitHub Student Pack 먼저 인증',
      'Pack에서 LinkedIn 항목 클릭',
      'LinkedIn 계정 연결',
      'Premium + Learning 활성'
    ],
    bestFor: ['취업 준비', '강의 시청', 'In Mail 사용'],
  },
  {
    slug: 'wolfram-alpha-pro',
    category: '학습·생산성',
    title: 'Wolfram Alpha Pro',
    provider: 'Wolfram',
    tagline: '학생 50% 할인 + 단계별 풀이',
    normalPrice: '$7.25/월',
    studentPrice: '$3.75/월',
    discount: '48%',
    verification: '학교 ISIC',
    koreaOk: true,
    signupUrl: 'https://www.wolframalpha.com/pro/pricing',
    recommend: 7,
    lastVerified: '2026-05',
    pitfalls: [
      '학생 인증 절차 까다로움 (학교 인증서)',
      'Mathematica Online은 별도'
    ],
    afterGraduation: '정가',
    steps: [
      'wolframalpha.com/pro/pricing',
      '학생 옵션 선택',
      '학교 인증서 업로드',
      '결제'
    ],
    bestFor: ['수학·물리·공학 학생', '미분·적분 풀이', '시험 공부'],
  },
  {
    slug: 'datacamp-student',
    category: '학습·생산성',
    title: 'DataCamp',
    provider: 'DataCamp',
    tagline: 'GitHub Student Pack에 3개월 + 매년 6개월 무료',
    normalPrice: '$39/월',
    studentPrice: '₩0 (3-6개월)',
    discount: '한정 기간 100%',
    verification: 'GitHub Student Pack',
    koreaOk: true,
    signupUrl: 'https://education.github.com/pack',
    recommend: 7,
    lastVerified: '2026-05',
    pitfalls: [
      'Student Pack 내 일부 항목 → 가끔 변경됨',
      'Premium 콘텐츠는 한국어 거의 없음 (영어 학습 필요)'
    ],
    afterGraduation: '정가',
    steps: [
      'GitHub Student Pack 인증',
      'DataCamp 항목 클릭 → 무료 활성'
    ],
    bestFor: ['데이터 분석·ML 공부', 'Python·R·SQL'],
  },
  {
    slug: 'youcom-students',
    category: '검색',
    title: 'You.com Pro',
    provider: 'You.com',
    tagline: '학생 무료 (시범 진행 중)',
    normalPrice: '$20/월',
    studentPrice: '₩0',
    discount: '100%',
    verification: '.ac.kr 이메일',
    koreaOk: true,
    signupUrl: 'https://you.com/students',
    recommend: 6,
    lastVerified: '2026-05',
    pitfalls: [
      '시범 프로그램 — 종료 시점 불확실',
      'Perplexity보다 한국어 검색 약함'
    ],
    afterGraduation: '정가',
    steps: [
      'you.com/students',
      '.ac.kr 이메일 인증',
      'Pro 활성'
    ],
    bestFor: ['Perplexity 대안', 'AI 검색 비교'],
  },
];

export function findStudentDeal(slug: string) {
  return studentDeals.find((d) => d.slug === slug);
}

export const totalSavings = studentDeals
  .filter((d) => d.koreaOk && d.discount.includes('100%'))
  .reduce((sum, d) => {
    const m = d.normalPrice.match(/[\d,]+/);
    if (!m) return sum;
    const n = parseInt(m[0].replace(/,/g, ''), 10);
    // crude: assume monthly USD, convert ~1375
    if (d.normalPrice.includes('$')) return sum + n * 1375 * 12;
    if (d.normalPrice.includes('₩')) return sum + n * 12;
    return sum;
  }, 0);
