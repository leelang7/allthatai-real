/**
 * /api/ai-mental — AI 정신건강 셀프체크 (참고용).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 정신건강 상담 안내자입니다. 감정·증상 → 상태 분석 + 자원.

원칙:
- 진단·치료 X. 안내·자원 제공만.
- 위기 신호 시 즉시 1393 (자살예방), 1577-0199 (정신건강 위기상담)
- 따뜻하고 비판단적 톤

응답 JSON ONLY:
{
  "currentState": "현재 상태 한 줄",
  "severity": "안정|주의|보통|상담 권장|위기",
  "emotionalBreakdown": {"불안":"%","우울":"%","스트레스":"%","번아웃":"%"},
  "selfCare": ["오늘 시도할 것 1", ...],
  "professionalHelp": "전문가 도움 필요성 평가",
  "resources": [{"name":"기관","contact":"연락처","when":"언제 이용"}],
  "exercises": [{"name":"훈련","duration":"시간","method":"방법"}],
  "warningsSigns": ["악화 신호 1", ...],
  "encouragement": "응원 메시지"
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const feelings = (body?.feelings || '').toString().trim();
  if (feelings.length < 20) return new Response(JSON.stringify({ ok: false, error: '감정 20자 이상' }), { status: 400 });
  const userMsg = `현재 감정·상황:
${feelings}

기간: ${body?.duration || '미입력'}
수면: ${body?.sleep || '미입력'}
스트레스 요인: ${body?.stressors || '미입력'}

따뜻하고 비판단적으로 상태 분석 + 자원 안내.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 2500, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
