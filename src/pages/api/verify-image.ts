/**
 * /api/verify-image — 이미지 진위 검증 (딥페이크·문서위조·등기부).
 *
 * Phase 1: URL 입력 + Gemini 2.0 Flash Vision 분석.
 * Phase 2: 직접 업로드 + Hive Moderation API ($0.05/img) 병렬.
 *
 * 입력: POST { input: image URL, slug }
 */
import type { APIRoute } from 'astro';
import { incrEvent } from '../../lib/stat-counter';
import { modelHeaders } from '../../lib/access-gate';
import { gateOrQuota, consumeQuota, FREE_LIMIT } from '../../lib/quota-gate';

// 자체 이미지 모델 + 시각화 대상 slug
const SELF_IMAGE_SLUGS = new Set(['deepfake-image', 'document-forgery', 'etungi-forgery', 'ai-image']);

/** verify.allthatai.kr 자체 이미지 모델 호출 → 시각화 결과. 실패 시 null → Gemini fallback. */
async function trySelfImageModel(slug: string, imageInput: string): Promise<any | null> {
  const modelApi = (import.meta.env as any).SCAM_MODEL_API || process.env.SCAM_MODEL_API;
  if (!modelApi || !SELF_IMAGE_SLUGS.has(slug)) return null;
  // base64만 지원 (data:image/... 또는 순수 base64)
  let b64 = imageInput;
  if (!imageInput.startsWith('data:image/')) {
    if (imageInput.startsWith('http')) return null; // URL은 Gemini로
  }
  try {
    const res = await fetch(`${modelApi}/verify/image`, {
      method: 'POST',
      headers: modelHeaders(),
      body: JSON.stringify({ image_b64: b64, slug }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.ok) return null;
    return {
      ok: true,
      slug,
      source: d.source || 'self-model:visual',
      riskScore: d.score,
      verdict: d.verdict,
      summary: d.summary,
      modelFakeProb: d.model_fake_prob,
      signals: d.signals,          // 신호별 점수/영역/근거 (시각화용)
      annotatedImage: d.annotated_b64,  // 의심영역 박스+heatmap PNG
      deepfakeRegion: d.deepfake_region,  // 모델 주목 부위 (눈·코·입·윤곽)
      deepfakeGrade: d.deepfake_grade,    // 합성 등급
      notes: d.notes,
      // 위험 신호는 서버가 task별로 구성한 red_flags 우선 (딥페이크는 모델 판단만)
      redFlags: Array.isArray(d.red_flags)
        ? d.red_flags
        : (d.signals || []).filter((s: any) => s.score >= 40).map((s: any) => `${s.signal} (${s.score}): ${s.reason}`),
    };
  } catch { return null; }
}

export const prerender = false;

const PROMPTS: Record<string, string> = {
  'deepfake-image': `당신은 이미지 딥페이크·조작 탐지 전문가입니다. 입력 이미지가 AI 생성·합성·조작인지 분석합니다.

체크:
- 얼굴 가장자리 흐림·아티팩트
- 조명·그림자 일관성
- 픽셀 압축 패턴 (재인코딩)
- 비대칭성 (귀·눈)
- 머리카락 가닥 자연스러움
- 손가락·치아 (AI 약점)
- 배경 왜곡
- 텍스트·로고 왜곡

응답 JSON ONLY:
{
  "riskScore": 0-100 (AI 생성·조작 확률),
  "verdict": "원본|의심|조작|AI 생성 확실",
  "summary": "한 줄 판단",
  "redFlags": ["탐지된 흔적 1", ...],
  "evidence": ["분석 근거 1", ...],
  "nextSteps": ["추가 검증 1 (역검색·EXIF 등)", ...]
}`,
  'document-forgery': `당신은 한국 공문서·증명서 위조 탐지 전문가입니다. 신분증·통장·재직증명·졸업장 등을 분석합니다.

체크:
- 정부 양식 폰트 일관성
- 워터마크·홀로그램
- 발급번호 양식·체크섬
- 인쇄 vs 디지털 합성 흔적
- 도장·서명 픽셀 흐릿함
- 그림자·정렬 부자연
- 발급일·발급기관 정합성

응답 JSON ONLY:
{
  "riskScore": 0-100,
  "verdict": "원본|의심|위조 확실",
  "summary": "한 줄 판단",
  "documentType": "추정 문서 유형",
  "redFlags": ["위조 흔적 1", ...],
  "verifySteps": ["정부 사이트 대조 방법 1 (정부24·민원24)", ...],
  "nextSteps": ["다음 조치 1", ...]
}`,
  'etungi-forgery': `당신은 한국 등기부등본 위조 탐지 전문가입니다.

검증 항목 (한국 인터넷등기소 표준):
1. 발급번호: 13자리 양식 (YYYY-MM-NNNNN-NNNNN)
2. 발급기관: "법원행정처" 명시
3. 발급일·열람일 (현재 ±3개월)
4. 갑구 (소유권): 등기순위·접수일·등기원인·소유자
5. 을구 (소유권 외): 근저당권·전세권·임차권
6. 도장·인지: 위치·크기·인쇄 품질
7. 폰트·간격: 정부 양식 일관성

자주 발생하는 위조 패턴:
- 근저당 금액 위조 (5억 → 1억) — 폰트 크기·간격 미세 차이
- 소유자 명의 위조
- 신탁·압류 등기 삭제
- 발급일이 3개월 초과 (최신 정보 거부 의도)
- 발급번호 자릿수 불일치
- 도장 픽셀 흐릿 (잘라붙임)
- "법원행정처" → "법윈행정처" 오타 (한자 비슷한 자 사용)

[Few-shot 예시]

예시 1 — 원본 가능 (riskScore 5):
발급번호 13자리, 발급일 ±5일, 근저당 1.2억 1건, 신탁 X, 압류 X
→ {"riskScore":5,"verdict":"원본 가능","redFlags":[]}

예시 2 — 위조 강력 의심 (riskScore 85):
근저당란 폰트 크기 다름, 금액 표기 일관성 X (1,000,000,000 vs 1.0억 혼용)
→ {"riskScore":85,"verdict":"위조 강력 의심","redFlags":[{"clause":"근저당 채권최고액 표기","severity":"높음","explanation":"정부 양식 콤마 위치·폰트 일관 X"}]}

예시 3 — 위조 확실 (riskScore 98):
발급번호 6자리만, 발급일 5년 전
→ {"riskScore":98,"verdict":"위조 확실","redFlags":[{"clause":"발급번호 6자리","severity":"높음","explanation":"정부 양식 13자리"},{"clause":"발급일 5년 경과","severity":"높음","explanation":"최신 발급 거부 의도"}]}

응답 JSON ONLY:
{
  "riskScore": 0-100 (위조 확률),
  "verdict": "원본 가능|의심|위조 강력 의심|위조 확실",
  "summary": "한 줄 판단",
  "detected": {
    "issueNumber": "발급번호 (있으면)",
    "issueDate": "발급일",
    "ownerName": "소유자명 (마스킹: 김**)",
    "mortgageTotal": "근저당 채권최고액 합 (원)",
    "hasTrust": true/false,
    "hasSeizure": true/false
  },
  "redFlags": [{"clause":"발견된 문제","severity":"높음|중간|낮음","explanation":"왜 위조 의심"}],
  "verifySteps": [
    "인터넷등기소(iros.go.kr)에서 발급번호로 본인 직접 조회",
    "임대인 입회 하 신규 발급 요청",
    "변호사·법무사 정식 검토 의뢰"
  ],
  "nextSteps": ["다음 조치 1", ...]
}`,
};

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });

  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  // 게이트: 유효 코드 → 무제한, 없으면 무료 3회
  const g = await gateOrQuota(request, body);
  if (!g.ok) return g.response!;

  const slug = (body?.slug || 'deepfake-image').toString();
  const imageInput = (body?.input || '').toString().trim();
  if (!imageInput) return new Response(JSON.stringify({ ok: false, error: '이미지 URL 또는 base64 필요' }), { status: 400 });

  incrEvent(`verify_image:${slug}`);

  // 1순위: 자체 이미지 모델 + 시각화 (deepfake/document/etungi/ai-image)
  const visual = await trySelfImageModel(slug, imageInput);
  if (visual) {
    if (g.useFree) {
      const used = await consumeQuota(request);
      visual.freeTier = { used, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - used) };
    }
    return new Response(JSON.stringify(visual), {
      headers: { 'Content-Type': 'application/json', 'X-Privacy-Policy': 'no-image-storage' },
    });
  }

  const systemPrompt = PROMPTS[slug] || PROMPTS['deepfake-image'];

  // Determine if base64 or URL
  let imagePart: any;
  if (imageInput.startsWith('data:image/')) {
    // base64
    const m = imageInput.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return new Response(JSON.stringify({ ok: false, error: 'base64 형식 오류' }), { status: 400 });
    imagePart = { inlineData: { mimeType: m[1], data: m[2] } };
  } else if (imageInput.startsWith('http')) {
    // Fetch the image and convert to base64
    try {
      const imgRes = await fetch(imageInput);
      if (!imgRes.ok) throw new Error(`이미지 fetch ${imgRes.status}`);
      const ct = imgRes.headers.get('content-type') || 'image/jpeg';
      const buf = await imgRes.arrayBuffer();
      if (buf.byteLength > 4 * 1024 * 1024) {
        return new Response(JSON.stringify({ ok: false, error: '이미지 4MB 초과' }), { status: 400 });
      }
      const base64 = Buffer.from(buf).toString('base64');
      imagePart = { inlineData: { mimeType: ct, data: base64 } };
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: '이미지 다운로드 실패: ' + (e instanceof Error ? e.message : 'unknown') }), { status: 400 });
    }
  } else {
    return new Response(JSON.stringify({ ok: false, error: 'URL (http*) 또는 data:image/...;base64,... 형식만' }), { status: 400 });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [imagePart, { text: '이미지 분석하세요.' }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
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
