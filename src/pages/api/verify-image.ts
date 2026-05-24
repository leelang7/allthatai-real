/**
 * /api/verify-image — 이미지 진위 검증 (딥페이크·문서위조·등기부).
 *
 * Phase 1: URL 입력 + Gemini 2.0 Flash Vision 분석.
 * Phase 2: 직접 업로드 + Hive Moderation API ($0.05/img) 병렬.
 *
 * 입력: POST { input: image URL, slug }
 */
import type { APIRoute } from 'astro';

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

체크:
- 발급번호 13자리 양식
- 발급일·열람일 일관성
- 갑구·을구 구조
- 폰트·간격 정부 양식 일치
- 소유자·근저당·신탁 항목 위조 가능성
- 도장·인지 위치

응답 JSON ONLY:
{
  "riskScore": 0-100,
  "verdict": "원본|의심|위조 확실",
  "summary": "한 줄 판단",
  "redFlags": ["위조 흔적 1", ...],
  "verifySteps": ["인터넷등기소 발급번호로 본인 직접 조회 (iros.go.kr)", "발급일 vs 열람일 차이 확인"],
  "nextSteps": ["임대인에게 본인 입회 하 등기 발급 요청", "변호사·법무사 정식 검토 의뢰"]
}`,
};

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });

  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const slug = (body?.slug || 'deepfake-image').toString();
  const imageInput = (body?.input || '').toString().trim();
  if (!imageInput) return new Response(JSON.stringify({ ok: false, error: '이미지 URL 또는 base64 필요' }), { status: 400 });

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [imagePart, { text: '이미지 분석하세요.' }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: 'application/json' },
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
    return new Response(JSON.stringify({ ok: true, slug, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 });
  }
};
