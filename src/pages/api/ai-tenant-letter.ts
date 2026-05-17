/**
 * /api/ai-tenant-letter — AI 임차인 공문 작성.
 *
 * 입력: POST { situation, context, formality }
 * 출력: { ok, letter, subject, suggestedSendMethod, legalBasis }
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 부동산 임대차 분쟁 법무 전문가입니다.
임차인 입장에서 임대인에게 보낼 정식 문서/내용증명/메시지를 작성합니다.

원칙:
1. 한국어 존댓말. 명확하고 강제력 있는 어조 (사정 호소 X)
2. 관련 법 조항 명시 (주택임대차보호법, 민법 등)
3. 구체적 요구사항 + 이행 기한 명시
4. 미이행 시 후속 조치 예고 (소송, 임차권 등기 등)
5. 증거 보존 안내 (등기우편 등)

응답은 JSON ONLY:
{
  "subject": "문서 제목 (예: 보증금 반환 요청서)",
  "letter": "완성된 공문 전문 (서두-본문-결어 포함, 한국어 존댓말)",
  "suggestedSendMethod": "내용증명 우편 | 등기 우편 | 문자 + 등기 | ...",
  "legalBasis": ["관련 법 조항 1", ...],
  "nextSteps": ["미이행 시 조치 1", ...],
  "warningSigns": ["주의해야 할 점 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const situation = (body?.situation || '').toString();
  const context = (body?.context || '').toString();
  const formality = body?.formality || 'formal';

  if (!situation || situation.length < 3) {
    return new Response(JSON.stringify({ ok: false, error: '상황 입력 필요' }), { status: 400 });
  }

  const userMsg = `상황 유형: ${situation}
구체적 맥락: ${context || '(미입력)'}
어조: ${formality === 'firm' ? '강경 (법적 조치 예고 포함)' : formality === 'gentle' ? '정중 (1차 협조 요청)' : '정식 (표준 내용증명)'}

위 상황에 맞는 공문을 작성하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2000, responseMimeType: 'application/json' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}`, detail: errText.slice(0, 300) }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); }
    catch {
      const cleaned = reply.replace(/```json|```/g, '').trim();
      try { parsed = JSON.parse(cleaned); }
      catch {
        return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패', raw: reply.slice(0, 300) }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, ...parsed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
