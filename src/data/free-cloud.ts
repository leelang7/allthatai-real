/**
 * 무료 클라우드 — 한국 사용자가 실제 받을 수 있는 영구·장기 무료 자원.
 *
 * 기준:
 *  - 카드 등록 필수면 명시
 *  - 12개월 vs 영구 명확 구분
 *  - 한국 가입 가능 여부 확인
 *  - 무료 한도 넘으면 청구되는 함정 표시
 */

export interface FreeCloud {
  slug: string;
  category: '컴퓨트' | '서버리스' | 'DB' | '스토리지' | 'CDN' | 'AI/GPU' | 'IDE' | '도메인';
  title: string;
  provider: string;
  /** 한 줄 가치 */
  tagline: string;
  /** 영구 | 12개월 | 학생 | 일회성 크레딧 */
  duration: '영구' | '12개월' | '학생' | '크레딧';
  /** 무료 한도 핵심 */
  freeQuota: string;
  /** 카드 등록 필요 여부 */
  cardRequired: boolean;
  /** 한국 카드 OK 여부 */
  koreaCardOk: boolean;
  /** 가입 사이트 */
  signupUrl: string;
  /** 추천 점수 (1-10) */
  recommend: number;
  /** 누가 쓰면 좋은가 */
  bestFor: string[];
  /** 함정·청구되는 케이스 */
  pitfalls: string[];
  /** 한도 초과 시 대안 */
  scaleUp: string;
  /** 신청 단계 */
  steps: string[];
}

export const freeClouds: FreeCloud[] = [
  {
    slug: 'oracle-always-free',
    category: '컴퓨트',
    title: 'Oracle Cloud Always Free',
    provider: 'Oracle',
    tagline: '진짜 영구 무료. Ampere ARM 4코어 24GB RAM (분할 가능)',
    duration: '영구',
    freeQuota: 'Ampere A1 4 vCPU + 24GB RAM, AMD x86 2 vCPU (총합), 200GB 블록 스토리지, 10TB egress/월, 2 ATP DB 20GB',
    cardRequired: true,
    koreaCardOk: true,
    signupUrl: 'https://www.oracle.com/cloud/free/',
    recommend: 10,
    bestFor: ['개인 서버', '24/7 봇·디스코드', '게임 서버', '셀프 호스팅 (Plex·Nextcloud)', '소규모 SaaS'],
    pitfalls: [
      '가입 시 카드 인증 ₩100 (즉시 반환)',
      'Always Free 인스턴스를 7일 미사용 시 회수 위험 → 가끔 SSH 접속 필요',
      'Ampere는 ARM64. x86 docker 이미지 호환 X (multi-arch 빌드 권장)',
      '리전 만석으로 인스턴스 생성 실패 잦음 → 다른 리전 시도'
    ],
    scaleUp: '한도 초과 시 자동 청구 X (Always Free 한정). 추가 자원은 PAYG 별도 결제 모드 필요',
    steps: [
      'oracle.com/cloud/free 접속 → "무료 시작"',
      '이메일 + 카드 (Visa/Master) — 한국 카드 OK',
      '한국은 Seoul/Chuncheon 리전 선택',
      'Always Free 라벨 인스턴스만 생성 (다른 건 청구됨)',
      'Ampere ARM = 4코어/24GB 한 번에 또는 4개 분할'
    ],
  },
  {
    slug: 'aws-free-tier',
    category: '컴퓨트',
    title: 'AWS Free Tier',
    provider: 'AWS',
    tagline: '12개월 무료 + 일부 영구 무료. EC2·S3·Lambda·RDS·CloudFront',
    duration: '12개월',
    freeQuota: 'EC2 t2.micro 750h/월, S3 5GB, Lambda 100만 호출/월 (영구), DynamoDB 25GB (영구), CloudFront 1TB/월 (12개월)',
    cardRequired: true,
    koreaCardOk: true,
    signupUrl: 'https://aws.amazon.com/free/',
    recommend: 8,
    bestFor: ['학습·실습', 'AWS 인증 준비', 'Lambda·DynamoDB 위주 서버리스', 'CloudFront CDN'],
    pitfalls: [
      'EC2 다른 인스턴스 타입 켜면 즉시 청구',
      'NAT Gateway·Load Balancer 무료 X',
      'EBS 볼륨 30GB 초과 청구',
      'CloudWatch Logs 무한 청구 가능',
      '12개월 후 자동 청구 (알람 X)'
    ],
    scaleUp: 'Reserved Instances로 EC2 1년 약정 → 30-60% 할인. Savings Plans 3년 약정 → 70%',
    steps: [
      'aws.amazon.com/free → 무료 계정 만들기',
      '카드 등록 + 휴대폰 인증',
      'Billing Alerts 즉시 설정 (₩100 한도 알림)',
      'AWS Budgets로 매월 ₩0 알림 설정',
      'Free Tier 사용량 대시보드 매주 확인'
    ],
  },
  {
    slug: 'gcp-free-tier',
    category: '컴퓨트',
    title: 'GCP Free Tier + $300 크레딧',
    provider: 'Google Cloud',
    tagline: '$300 / 90일 + 영구 무료 (e2-micro VM·5GB·Cloud Run 등)',
    duration: '크레딧',
    freeQuota: '$300 크레딧 (90일), 영구: e2-micro 1대 (us-central1), Cloud Run 200만 요청/월, BigQuery 1TB 쿼리/월, Firestore 1GB',
    cardRequired: true,
    koreaCardOk: true,
    signupUrl: 'https://cloud.google.com/free',
    recommend: 9,
    bestFor: ['BigQuery 데이터 분석', 'Firebase·Cloud Run 서버리스', 'Vertex AI 실습', 'Gemini API'],
    pitfalls: [
      '$300 종료 후 자동 청구 모드 전환 (명시적 거부 가능)',
      'e2-micro 영구 무료는 us-central1·us-west1·us-east1만',
      'Cloud SQL은 영구 무료 X',
      'Compute Engine 외부 IP egress 비쌈'
    ],
    scaleUp: '확약 사용 할인 (CUD) 1년 25% / 3년 52%. Free 사용량 + Spot VM 조합 최저가',
    steps: [
      'cloud.google.com/free → 무료 시작',
      'Google 계정 + 카드 (₩1,000 인증 후 환불)',
      '결제 알림 설정 (₩0 임계값)',
      '$300 크레딧 사용 + 영구 무료 리소스 분리',
      '90일 후 자동 PAYG 전환 — 거부 가능'
    ],
  },
  {
    slug: 'azure-students',
    category: '컴퓨트',
    title: 'Azure for Students',
    provider: 'Microsoft',
    tagline: '학생 $100 / 1년 + 카드 X. 갱신 가능',
    duration: '학생',
    freeQuota: '$100 크레딧 / 12개월 (카드 등록 안 함). 일부 서비스 영구 무료',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://azure.microsoft.com/free/students/',
    recommend: 9,
    bestFor: ['대학생·대학원생', 'Azure 학습', 'GitHub Student Pack 연계'],
    pitfalls: [
      '학교 .ac.kr 또는 .edu 이메일 필요',
      'GitHub Student Pack 인증 동시 진행 추천',
      '$100 소진 후 자동 정지 (청구 X)',
      '졸업 후 일반 Free Tier로 전환'
    ],
    scaleUp: '졸업 후 Azure Free Account (₩30만 크레딧 30일). 그 후 PAYG',
    steps: [
      'azure.microsoft.com/free/students 접속',
      'Microsoft 계정 + 학교 이메일 (.ac.kr)',
      '학생 인증 (학교 ID 카드 사진)',
      '신원 확인 1-2일',
      'GitHub Student Pack 따로 신청 권장'
    ],
  },
  {
    slug: 'cloudflare-free',
    category: '서버리스',
    title: 'Cloudflare Free',
    provider: 'Cloudflare',
    tagline: 'Workers·Pages·R2 — egress 무료. DDoS·CDN 무제한',
    duration: '영구',
    freeQuota: 'Workers 10만 요청/일, Pages 무제한 빌드 (500/월), R2 10GB 스토리지 + egress 무료, DNS·CDN 무제한, KV 100K reads/일',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://dash.cloudflare.com/sign-up',
    recommend: 10,
    bestFor: ['정적 사이트 호스팅', 'API 백엔드 (Workers)', '이미지·파일 저장 (egress 비싼 S3 대체)', 'DDoS 방어'],
    pitfalls: [
      'Workers CPU 시간 10ms (Free) — 무거운 작업 불가',
      'R2 operations (PUT) 100만/월 제한',
      'Pages는 정적만 (서버 함수는 Workers)',
      'KV는 read-heavy 최적화 (write 비쌈)'
    ],
    scaleUp: 'Workers Paid $5/월 → 무제한 + 50ms CPU. R2 Paid $0.015/GB',
    steps: [
      'dash.cloudflare.com 가입 (카드 X)',
      'Workers 또는 Pages 프로젝트 생성',
      'GitHub 연결 → 자동 배포',
      '도메인 DNS Cloudflare로 이전 (선택)',
    ],
  },
  {
    slug: 'vercel-hobby',
    category: '서버리스',
    title: 'Vercel Hobby',
    provider: 'Vercel',
    tagline: 'Next.js·Astro 등 무료 배포. 100GB 대역폭',
    duration: '영구',
    freeQuota: '100GB 대역폭/월, 무제한 사이트, Serverless Functions 100GB-Hours, 6,000 빌드 분/월',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://vercel.com/signup',
    recommend: 9,
    bestFor: ['Next.js·Astro·React 사이트', '개인 포트폴리오', '인디 프로젝트', '데모 사이트'],
    pitfalls: [
      '상업적 사용 (광고 포함 포트폴리오 사이트) 회색지대 — 큰 트래픽 시 Pro 강제',
      'KV·Postgres·Blob 별도 제한',
      'AdSense·어필리에이트 사이트는 Pro 권장',
      'Edge Function 50KB 코드 한도'
    ],
    scaleUp: 'Pro $20/팀원·월. 1TB 대역폭, 무제한 빌드',
    steps: [
      'vercel.com/signup → GitHub 로그인',
      'GitHub repo import → 자동 빌드',
      '도메인 무료 *.vercel.app',
      '커스텀 도메인 추가 가능 (DNS만 설정)'
    ],
  },
  {
    slug: 'supabase-free',
    category: 'DB',
    title: 'Supabase Free',
    provider: 'Supabase',
    tagline: 'Postgres + Auth + Storage + Realtime. 500MB',
    duration: '영구',
    freeQuota: 'Postgres 500MB, Auth 5만 MAU, Storage 1GB, Edge Functions 50만 호출/월, 2개 프로젝트',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://supabase.com/dashboard/sign-up',
    recommend: 9,
    bestFor: ['Postgres 기반 앱', 'Firebase 대안', '로그인 시스템', 'Realtime 채팅'],
    pitfalls: [
      '1주일 미사용 시 프로젝트 일시 정지 (수동 재시작)',
      '7일+ 미사용 = 영구 정지 가능',
      'Egress 5GB/월 한도',
      'Connection pool 한도 60'
    ],
    scaleUp: 'Pro $25/월 → 8GB DB + 무제한 활성',
    steps: [
      'supabase.com 가입',
      'New Project → 리전 선택 (싱가포르·도쿄 가까움)',
      'API 키 + Postgres URL 받음',
      'SDK 또는 REST 사용'
    ],
  },
  {
    slug: 'neon-free',
    category: 'DB',
    title: 'Neon Postgres Free',
    provider: 'Neon',
    tagline: '서버리스 Postgres. 3GB. Branch 가능',
    duration: '영구',
    freeQuota: '0.5GB 데이터 + 3GB storage history, 무제한 DB·Branch, 0.25 CU autoscale',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://console.neon.tech/signup',
    recommend: 9,
    bestFor: ['서버리스 함수 + Postgres', 'Git처럼 DB 브랜치 필요', 'Vercel·Cloudflare 함수와 페어'],
    pitfalls: [
      '5분 미사용 시 자동 sleep → 첫 쿼리 cold start (~수초)',
      'storage history는 30일까지만',
      '쿼리 비활성 시 컴퓨트 자동 정지'
    ],
    scaleUp: 'Launch $19/월 → 10GB + autoscale 4 CU',
    steps: [
      'neon.tech 가입 (GitHub OAuth)',
      'New Project → 리전 (Tokyo 추천)',
      'Postgres URL 복사 → 앱에 붙여넣기'
    ],
  },
  {
    slug: 'upstash-free',
    category: 'DB',
    title: 'Upstash Redis Free',
    provider: 'Upstash',
    tagline: 'Redis + Kafka. 1만 요청/일',
    duration: '영구',
    freeQuota: 'Redis: 256MB + 10K commands/일, Kafka: 10K messages/일, REST API + Edge global',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://console.upstash.com',
    recommend: 8,
    bestFor: ['세션 캐시', 'Rate limit', '큐 (Kafka)', 'Edge Function용 빠른 KV'],
    pitfalls: [
      '10K commands/일 = 분당 약 7회. 트래픽 큰 사이트 부족',
      '256MB 초과 시 자동 청구 가능 (Pay-as-you-go)'
    ],
    scaleUp: 'Pay-as-you-go: $0.2/100K commands',
    steps: [
      'upstash.com 가입 (GitHub OAuth)',
      'New Redis Database → 글로벌 또는 단일 리전',
      'REST URL + Token 복사',
      'Vercel·Cloudflare 환경변수에 등록'
    ],
  },
  {
    slug: 'huggingface-spaces',
    category: 'AI/GPU',
    title: 'Hugging Face Spaces',
    provider: 'Hugging Face',
    tagline: '무료 GPU 16GB (제한적). Gradio·Streamlit 호스팅',
    duration: '영구',
    freeQuota: 'CPU 무료 무제한, Zero GPU (T4) 분당 사용 한도, Inference API 한도 있음',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://huggingface.co/join',
    recommend: 7,
    bestFor: ['ML 데모 공개', 'Gradio 앱 호스팅', '오픈소스 모델 추론 무료'],
    pitfalls: [
      'Zero GPU는 대기 시간 길음',
      '비공개 Space는 Pro $9/월',
      '대형 모델 (Llama 70B) 무료로 못 돌림'
    ],
    scaleUp: 'Pro $9/월 → A10G GPU + 비공개 Space',
    steps: [
      'huggingface.co 가입',
      'New Space → SDK 선택 (Gradio·Streamlit·Docker)',
      'GitHub처럼 git push로 배포',
      'Zero GPU 활성화 (필요시)'
    ],
  },
  {
    slug: 'gemini-api-free',
    category: 'AI/GPU',
    title: 'Gemini API Free Tier',
    provider: 'Google AI Studio',
    tagline: 'Gemini 2.0 Flash 무료 LLM API. 15 RPM',
    duration: '영구',
    freeQuota: 'gemini-2.0-flash: 15 요청/분, 100만 토큰/일, 1500 요청/일. Pro: 2 RPM, 50 요청/일',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://aistudio.google.com/apikey',
    recommend: 10,
    bestFor: ['AI 앱 무료 백엔드', 'Gemini 학습', '챗봇 데모', 'AI 도구 사이트'],
    pitfalls: [
      '데이터 학습에 사용됨 (Free Tier만)',
      '한국어 일부 제한적',
      '이미지·비디오 입력 한도 다름',
      'Rate limit 빡빡 → 키 여러 개 로테이션 권장'
    ],
    scaleUp: 'Paid Tier: 데이터 학습 X, 무제한 RPM',
    steps: [
      'aistudio.google.com/apikey',
      'Google 계정 로그인',
      'Create API Key → 복사',
      'process.env.GEMINI_API_KEY로 사용',
      '로테이션: GEMINI_API_KEY_2·_3 추가 키 생성'
    ],
  },
  {
    slug: 'github-actions',
    category: 'IDE',
    title: 'GitHub Actions',
    provider: 'GitHub',
    tagline: '무료 CI/CD 2000분/월. 공개 repo 무제한',
    duration: '영구',
    freeQuota: '공개 repo: 무제한, 비공개: 2,000분/월 (Free), 3,000분 (Pro), 50K (Team)',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://github.com',
    recommend: 10,
    bestFor: ['CI 빌드·테스트', 'Cron 스케줄러', '자동 배포', 'AI 자동 컨텐츠 생성'],
    pitfalls: [
      'Windows·macOS runner는 2x·10x 비용',
      'Actions cache 5GB 초과 시 오래된 것부터 삭제',
      'self-hosted runner는 보안 리스크'
    ],
    scaleUp: 'GitHub Pro $4/월 → 3,000분, Team $4/사용자',
    steps: [
      'GitHub repo의 .github/workflows/*.yml 추가',
      'cron 트리거 설정 (예: \'0 0 * * *\')',
      '시크릿은 Settings → Secrets',
      '월 사용량 확인: Settings → Billing'
    ],
  },
  {
    slug: 'codespaces-free',
    category: 'IDE',
    title: 'GitHub Codespaces',
    provider: 'GitHub',
    tagline: '클라우드 VS Code. 60시간 무료 + 학생 무제한',
    duration: '영구',
    freeQuota: 'Free: 60시간 · 2 vCPU/4GB · 15GB 스토리지/월. Student: 180시간',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://github.com/codespaces',
    recommend: 8,
    bestFor: ['아이패드·크롬북에서 코딩', 'GPU 없는 PC에서 실험', '협업 (Live Share)'],
    pitfalls: [
      '60시간 초과 시 시간당 ₩200 ~ ₩1,000',
      '비활성 30분 → 자동 정지 (재시작 빠름)',
      '디스크 15GB 초과 시 청구'
    ],
    scaleUp: 'Student Pack 가입 시 180시간',
    steps: [
      'github.com/codespaces',
      'repo에서 Code → Create codespace',
      'devcontainer.json으로 환경 자동',
      'VS Code 브라우저·데스크탑 모두'
    ],
  },
  {
    slug: 'render-free',
    category: '서버리스',
    title: 'Render Free Web Service',
    provider: 'Render',
    tagline: '무료 web/worker 750시간/월',
    duration: '영구',
    freeQuota: 'Web Service 750시간/월, PostgreSQL 90일 무료 (이후 만료), Static Site 무료',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://dashboard.render.com/register',
    recommend: 7,
    bestFor: ['Heroku 대체', 'Django·FastAPI 백엔드', 'Discord 봇'],
    pitfalls: [
      '15분 미사용 시 sleep (cold start 30-60초)',
      'Postgres 90일 후 강제 삭제',
      'Persistent disk 무료 X'
    ],
    scaleUp: 'Starter $7/월 → 항상 켜짐, 더 빠른 CPU',
    steps: [
      'dashboard.render.com 가입',
      'New Web Service → GitHub repo 연결',
      'Build/Start 명령 입력',
      '환경변수 추가'
    ],
  },
  {
    slug: 'fly-io-free',
    category: '컴퓨트',
    title: 'Fly.io 무료 한도',
    provider: 'Fly.io',
    tagline: '글로벌 엣지 컨테이너. 3개 작은 VM',
    duration: '영구',
    freeQuota: '$5 무료 사용량/월: 3개 shared-1x-cpu / 256MB, 3GB persistent volumes, 160GB egress',
    cardRequired: true,
    koreaCardOk: true,
    signupUrl: 'https://fly.io/app/sign-up',
    recommend: 7,
    bestFor: ['Docker 워크로드', '글로벌 배포 (도쿄·서울)', 'Postgres·Redis 자체 호스팅'],
    pitfalls: [
      '카드 등록 필수',
      '한도 초과 시 자동 청구',
      '256MB는 작음 — Node.js 무거운 앱 메모리 부족'
    ],
    scaleUp: 'Pay-as-you-go: 시간당 약 $0.002',
    steps: [
      'fly.io/sign-up → 카드 등록',
      'flyctl CLI 설치',
      'fly launch → Dockerfile 자동 감지',
      'Tokyo (nrt) 또는 Seoul (icn) 리전'
    ],
  },
  {
    slug: 'deno-deploy-free',
    category: '서버리스',
    title: 'Deno Deploy Free',
    provider: 'Deno',
    tagline: '글로벌 엣지 Deno 런타임. 100만 요청/달',
    duration: '영구',
    freeQuota: '1M 요청/월, 100GB egress/월, 무료 프로젝트 수 무제한',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://deno.com/deploy',
    recommend: 7,
    bestFor: ['Deno·TypeScript 익숙', 'Edge 함수', 'JSR 패키지 사용'],
    pitfalls: [
      'Node.js 호환은 거의 되지만 일부 패키지 X',
      'CPU 시간 10ms (Free)',
      'KV 1GB 한도'
    ],
    scaleUp: 'Pro $20/월 → 무제한 요청',
    steps: [
      'deno.com/deploy → GitHub 로그인',
      '새 프로젝트 → repo 연결',
      'deploy 파일 지정',
      '환경변수 설정'
    ],
  },
  {
    slug: 'digitalocean-credit',
    category: '컴퓨트',
    title: 'DigitalOcean $200 크레딧',
    provider: 'DigitalOcean',
    tagline: '60일 $200 크레딧 (GitHub Student) 또는 $100',
    duration: '크레딧',
    freeQuota: '$200 / 60일 (GitHub Student Pack), $100 / 60일 (일반 신규)',
    cardRequired: true,
    koreaCardOk: true,
    signupUrl: 'https://www.digitalocean.com/github-students',
    recommend: 7,
    bestFor: ['VPS 실습', 'Kubernetes 실험', 'Database 호스팅'],
    pitfalls: [
      'GitHub Student Pack 인증 필요',
      '60일 후 자동 PAYG',
      'Droplet은 시간당 청구 (안 쓸 때 destroy 필수)'
    ],
    scaleUp: 'Basic Droplet $4/월 (1 vCPU/1GB)',
    steps: [
      'GitHub Student Pack 신청 후 DigitalOcean 링크',
      '카드 등록 (₩100 인증)',
      '$200 자동 적용 (60일)',
      '한국 가까운 리전 = Singapore'
    ],
  },
  {
    slug: 'namecheap-free-domain',
    category: '도메인',
    title: '무료 도메인 (1년)',
    provider: 'Namecheap / Porkbun',
    tagline: 'GitHub Student Pack 무료 .me 1년 + 첫 해 $1 .com',
    duration: '학생',
    freeQuota: 'Namecheap: .me 1년 무료 (Student), Porkbun: 첫 해 ~$1 .com',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://nc.me',
    recommend: 8,
    bestFor: ['포트폴리오 사이트', '학생 프로젝트'],
    pitfalls: [
      '갱신 시 정가 (.me 약 ₩2만/년)',
      '학생 인증 필요',
      '.com 학생 무료는 없음 (Porkbun 첫 해 할인만)'
    ],
    scaleUp: '갱신 또는 Porkbun으로 이전 (저렴함)',
    steps: [
      'GitHub Student Pack 인증',
      'nc.me에서 .me 도메인 무료',
      'DNS Cloudflare로 변경 권장',
      'Vercel·Pages 연결'
    ],
  },
  {
    slug: 'cloudinary-free',
    category: '스토리지',
    title: 'Cloudinary 무료',
    provider: 'Cloudinary',
    tagline: '이미지·동영상 CDN + 변환. 25 크레딧/월',
    duration: '영구',
    freeQuota: '25 크레딧/월 (≈ 25GB 스토리지 + 25GB 대역폭 + 25K 변환)',
    cardRequired: false,
    koreaCardOk: true,
    signupUrl: 'https://cloudinary.com/users/register/free',
    recommend: 7,
    bestFor: ['이미지 자동 리사이즈', '동영상 트랜스코딩', 'Next.js Image 백엔드'],
    pitfalls: [
      '25 크레딧 = 작은 사이트만 가능',
      '한도 초과 시 이미지 안 뜸 (자동 청구 X)'
    ],
    scaleUp: 'Plus $89/월',
    steps: [
      'cloudinary.com 가입',
      'Upload 또는 URL 변환 API 사용',
      'Cloud name·API key 받기'
    ],
  },
  {
    slug: 'planetscale-vs-replicate',
    category: 'AI/GPU',
    title: 'Replicate (AI 모델 API)',
    provider: 'Replicate',
    tagline: '신용카드 등록 시 $0.01-1 어치 무료 + Pay-as-you-go',
    duration: '크레딧',
    freeQuota: '무료 한도 없음 — 카드 등록 후 사용량 청구. 처음 $5 무료 크레딧 가끔 제공',
    cardRequired: true,
    koreaCardOk: true,
    signupUrl: 'https://replicate.com',
    recommend: 6,
    bestFor: ['Stable Diffusion·Whisper·Llama 추론', 'GPU 없이 모델 사용'],
    pitfalls: [
      '쓴 만큼 청구 (1초 단위 GPU)',
      '큰 모델은 분당 $1-3 쉽게',
      'cold start 30초+'
    ],
    scaleUp: '월 자체 GPU 임대 (RunPod) 더 저렴',
    steps: [
      'replicate.com 가입',
      '카드 등록 (필수)',
      'API token 받기',
      'curl 또는 SDK로 호출'
    ],
  },
];

export function findFreeCloud(slug: string) {
  return freeClouds.find((f) => f.slug === slug);
}
