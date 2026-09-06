/**
 * /api/verify-text — 통합 텍스트 사기 검증.
 *
 * 입력: POST { input: string, slug: string }
 * slug별로 시스템 프롬프트 + 카테고리 특화 분석.
 */
import type { APIRoute } from 'astro';
import { incrEvent } from '../../lib/stat-counter';
import { modelHeaders } from '../../lib/access-gate';
import { gateOrQuota, consumeQuota, FREE_LIMIT } from '../../lib/quota-gate';

export const prerender = false;

const PROMPTS: Record<string, string> = {
  'phishing-text': `당신은 한국 사이버범죄 분석가입니다. 입력된 SMS·카톡·이메일이 피싱·스미싱·보이스피싱 유도 메시지인지 판단합니다.

체크 패턴:
- URL 단축·이상 도메인 (gov.kr 위장, 비슷한 도메인)
- 긴급성 자극 (즉시·오늘만·계좌 정지·확인 안 하면)
- 정부·은행·택배 사칭
- APK 파일·악성 링크 유도
- 발신 도메인 변조
- 문법·맞춤법 오류
- AI 생성 패턴
- 한국 사기 패턴 DB 매칭

응답 JSON ONLY:
{
  "riskScore": 0-100 정수,
  "verdict": "안전|의심|위험|매우위험",
  "summary": "한 줄 판단",
  "redFlags": ["탐지된 위험 신호 1", ...],
  "scamType": "피싱|스미싱|보이스피싱 유도|기타",
  "impersonates": "사칭 대상 (택배·은행·정부·기타)",
  "nextSteps": ["즉시 차단·신고 1", ...],
  "reportTo": "신고처 (118·112·KISA·해당 기관)"
}`,
  'romance-scam': `당신은 로맨스 스캠 전문 분석가입니다. 입력된 대화·프로필이 연애 사기인지 분석합니다.

체크 패턴:
- 직접 만나기 거부 또는 회피
- 돈·송금·코인·주식 언급
- 한 번도 만난 적 없는데 사랑 고백
- 외국인·해외 거주·군인·의사 사칭
- 카톡·인스타에서 다른 앱으로 이동 유도
- AI 생성 답변 (지나치게 매끄러움)
- 한 번에 여러 사람과 대화 패턴

응답 JSON ONLY:
{
  "riskScore": 0-100,
  "verdict": "안전|의심|위험|매우위험",
  "summary": "한 줄 판단",
  "redFlags": ["위험 신호 1", ...],
  "scamPattern": "스캠 패턴 분류 (군인 사칭·외국인 의사·코인 권유 등)",
  "nextSteps": ["즉시 조치 1", ...],
  "reportTo": "사이버수사대·앱 신고"
}`,
  'health-gym-terms': `당신은 한국 소비자 분쟁 전문가입니다. 헬스장·필라테스·요가·PT 약관에서 함정 조항을 탐지합니다.

체크:
- 환불 거부 조항 (소비자분쟁해결기준 위반)
- 중도해지 위약금 (10% 초과는 무효)
- 자동 갱신 조항
- PT 회당 단가 부풀림
- 폐업 시 환불 보장 (할부거래법)
- 7일 청약철회 거부
- 양도 금지

응답 JSON ONLY:
{
  "riskScore": 0-100,
  "verdict": "공정|보통|불공정|매우 불공정",
  "summary": "한 줄 평가",
  "redFlags": [{"clause":"원문 발췌","issue":"문제점","legalBasis":"위반 법조항"}],
  "consumerRights": ["당신의 법적 권리 1", ...],
  "nextSteps": ["환불 요청 절차 1", ...],
  "reportTo": "한국소비자원 (1372) 또는 공정거래위"
}`,
  'insurance-terms': `당신은 보험소비자연맹 분석가입니다. 보험 약관의 면책·대기기간·환급 조건을 분석합니다.

체크:
- 면책 조항 (지급 안 하는 사유)
- 대기기간
- 갱신 시 보험료 인상 폭
- 환급금 계산 (저축성)
- 청구 시효
- 특약 우선순위
- 중복 보장

응답 JSON ONLY:
{
  "riskScore": 0-100,
  "verdict": "추천|보통|주의|회피",
  "summary": "한 줄 평가",
  "coverage": "실제 보장 범위 요약",
  "exclusions": ["면책 사유 1", ...],
  "hiddenCosts": ["숨은 비용 1", ...],
  "redFlags": ["함정 1", ...],
  "nextSteps": ["가입 전 확인 1", ...],
  "reportTo": "금감원 (1332) · 보험소비자연맹"
}`,
  'telecom-terms': `당신은 통신비 분석가입니다. SKT·KT·LGU+ 약정·결합·위약금을 분석합니다.

응답 JSON ONLY:
{
  "riskScore": 0-100,
  "verdict": "공정|보통|불리|매우 불리",
  "summary": "한 줄 평가",
  "monthlyEffectiveCost": "실효 월 요금 (위약금 분산)",
  "earlyExitPenalty": "조기 해지 시 위약금 예상",
  "autoRenewal": true/false,
  "redFlags": ["함정 1", ...],
  "nextSteps": ["대안 1", ...],
  "reportTo": "방통위 민원 1335"
}`,
  'subscription-terms': `당신은 구독 서비스 분석가입니다. OTT·구독박스·앱 결제의 해지·환불 조건을 분석합니다.

응답 JSON ONLY:
{
  "riskScore": 0-100,
  "verdict": "공정|보통|불리|매우 불리",
  "summary": "한 줄 평가",
  "trialPattern": "무료 체험 함정 분석",
  "cancelPath": ["해지 단계 1", ...],
  "refundPolicy": "환불 가능 여부",
  "redFlags": ["함정 1", ...],
  "nextSteps": ["조치 1", ...],
  "reportTo": "한국소비자원 1372"
}`,
  // 2026-09-06: 입력에 없는 신호를 묻던 것을 걷어냈다.
  // 예전 프롬프트는 '동일 사용자 다중 리뷰'·'시간대 집중'·'사진 메타데이터 중복'을
  // 체크 항목으로 줬는데, 이 엔드포인트가 받는 것은 **붙여넣은 텍스트 한 덩어리뿐**이다.
  // 작성자 계정도 작성 시각도 사진도 없다. 없는 것을 물으면 모델은 답을 만들어 낸다 —
  // 사기 탐지 제품에서 날조된 근거는 미탐보다 나쁘다. `fakeRatio` 같은 화면에 쓰지도 않는
  // 추정 수치 필드도 함께 뺐다(렌더되는 것은 summary·riskScore·verdict·redFlags 뿐).
  'fake-review': `당신은 리뷰 조작 탐지 분석가입니다. **입력된 텍스트 안에서 관측되는 것만** 판단합니다.

입력에 없는 정보는 절대 지어내지 마세요. 이 입력에는 작성자 계정, 작성 시각, 사진이
포함되어 있지 않습니다 — 그런 항목은 redFlags 에 넣지 말고 cannotCheck 에 적으세요.

관측 가능한 것(이것만 봅니다):
- AI·템플릿 문체 (지나치게 매끄럽고 격식적, 상품 설명을 옮긴 듯한 어투)
- 여러 리뷰가 함께 붙여넣어진 경우, 그 리뷰들 사이의 문체·구성 유사성
- "강추·완전 최고" 같은 과장 표현의 비율
- 구체적 사용 경험(사용 기간·상황·단점)의 부재

응답 JSON ONLY:
{
  "riskScore": 0-100 정수,
  "verdict": "신뢰|보통|의심|조작 확실",
  "summary": "한 줄 판단",
  "redFlags": ["입력에서 실제로 관측된 신호만"],
  "cannotCheck": ["입력에 없어 확인하지 못한 것 (작성자 이력·작성 시각·사진 등)"],
  "nextSteps": ["조치 1", ...],
  "reportTo": "공정거래위원회 (표시·광고의 공정화에 관한 법률 위반 신고)"
}`,
  // 2026-09-06: 계산할 수 없는 값을 묻던 것을 걷어냈다.
  // `Perplexity 점수`는 텍스트를 눈으로 봐서 나오는 값이 아니다 — 물으면 숫자를 지어낸다.
  // `likelyModel`(어느 LLM이 썼는지)도 신뢰성 있게 추정할 수 없고 화면에 쓰이지도 않았다.
  // 대신 짧은 글일수록 판정이 약하다는 사실을 모델이 스스로 말하게 한다.
  'ai-text-detection': `당신은 한국어 AI 생성 텍스트 탐지 분석가입니다. 입력 텍스트를 LLM이 썼는지 판단합니다.

**계산할 수 없는 값을 지어내지 마세요.** Perplexity 같은 수치는 이 자리에서 계산되지
않습니다. 어느 모델이 썼는지도 신뢰성 있게 알 수 없으므로 추정하지 마세요.

관측 가능한 것(이것만 봅니다):
- 문장 길이·구조의 단조로움
- "또한·따라서·결론적으로·중요한 것은" 연결어 과다
- 구체적 경험·고유명사·수치의 결여, 추상적 일반론
- 명사 나열형·병렬 나열 구조
- 번역투 표현
- 오탈자·구어체 흔들림의 부재

응답 JSON ONLY:
{
  "riskScore": 0-100 정수,
  "verdict": "인간 작성|혼합|AI 작성|확실 AI",
  "summary": "한 줄 판단",
  "confidence": "높음|보통|낮음 — 글이 짧을수록 낮게 잡으세요",
  "redFlags": ["관측된 AI 흔적만"],
  "limitation": "이 판정의 한계 한 문장 (예: 300자 미만은 신뢰도가 낮습니다)",
  "nextSteps": ["검증 방법 1", ...]
}`,
};

const DEFAULT_PROMPT = PROMPTS['phishing-text'];

// 자체 한국어 모델로 우선 처리하는 slug (학습 완료 후 SCAM_MODEL_API 등록 시 활성)
const SELF_MODEL_SLUGS = new Set(['ai-text-detection', 'fake-review', 'romance-scam']);
const MODEL_SLUG_MAP: Record<string, string> = {
  'ai-text-detection': 'ai-text',
  'fake-review': 'fake-review',
  'romance-scam': 'romance-scam',
};

async function trySelfModel(slug: string, input: string): Promise<any | null> {
  const modelApi = (import.meta.env as any).SCAM_MODEL_API || process.env.SCAM_MODEL_API;
  if (!modelApi || !SELF_MODEL_SLUGS.has(slug)) return null;
  const endpoint = MODEL_SLUG_MAP[slug];
  try {
    const res = await fetch(`${modelApi}/verify/${endpoint}`, {
      method: 'POST',
      headers: modelHeaders(),
      body: JSON.stringify({ text: input }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // 자체 모델 결과를 Gemini 응답 형식으로 변환
    return {
      ok: true,
      slug,
      source: 'self-model:ko-bert',
      riskScore: data.risk_score,
      verdict: data.verdict,
      summary: `자체 한국어 모델 분석. AI 확률 ${(data.positive_probability * 100).toFixed(1)}%`,
      modelProbabilities: {
        positive: data.positive_probability,
        negative: data.negative_probability,
      },
    };
  } catch { return null; }
}

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  // 게이트: 유효 코드 → 무제한, 없으면 무료 3회
  const g = await gateOrQuota(request, body);
  if (!g.ok) return g.response!;

  const slug = (body?.slug || '').toString();
  const input = (body?.input || '').toString().trim();
  if (input.length < 5) return new Response(JSON.stringify({ ok: false, error: '입력 5자 이상' }), { status: 400 });
  if (input.length > 30000) return new Response(JSON.stringify({ ok: false, error: '입력 30,000자 초과' }), { status: 400 });

  // 카운터 INCR (Upstash 등록 시)
  incrEvent(`verify_text:${slug}`);

  // 1순위: 자체 한국어 모델 (학습 완료 + SCAM_MODEL_API 등록 시)
  const selfResult = await trySelfModel(slug, input);
  if (selfResult) {
    let freeTier: any = undefined;
    if (g.useFree) {
      const used = await consumeQuota(request);
      freeTier = { used, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - used) };
    }
    return new Response(JSON.stringify({ ...selfResult, privacy: 'no_input_storage', freeTier }), {
      headers: { 'Content-Type': 'application/json', 'X-Privacy-Policy': 'no-input-storage' },
    });
  }

  // 2순위: Gemini fallback
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정 (자체 모델도 비활성)' }), { status: 500 });

  const systemPrompt = PROMPTS[slug] || DEFAULT_PROMPT;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2500, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}`, detail: errText.slice(0, 300) }), { status: 502 });
    }
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); }
    catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); }
      catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패', raw: reply.slice(0, 300) }), { status: 502 }); }
    }
    let freeTier: any = undefined;
    if (g.useFree) {
      const used = await consumeQuota(request);
      freeTier = { used, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - used) };
    }
    return new Response(JSON.stringify({ ok: true, slug, privacy: 'no_input_storage', ...parsed, freeTier }), {
      headers: { 'Content-Type': 'application/json', 'X-Privacy-Policy': 'no-input-storage' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 });
  }
};
