/**
 * /api/ai-nutrition — AI 음식 영양 분석.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 영양사입니다. 음식명/식단 → 칼로리·매크로·영양 분석.

응답 JSON ONLY:
{
  "totalCalories": "총 칼로리 (kcal)",
  "macros": {"protein":"g","carbs":"g","fat":"g","fiber":"g"},
  "items": [{"name":"음식","calories":"kcal","protein":"g","carbs":"g","fat":"g","portion":"양"}],
  "healthScore": 0-100,
  "verdict": "매우 좋음|좋음|보통|개선 필요",
  "missingNutrients": ["부족한 영양소 1", ...],
  "excessNutrients": ["과다 영양소 1", ...],
  "improvements": ["개선 제안 1", ...],
  "comparisonToDV": "1일 권장량 대비 분석"
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const foods = (body?.foods || '').toString().trim();
  if (!foods) return new Response(JSON.stringify({ ok: false, error: '음식 입력 필수' }), { status: 400 });
  const userMsg = `먹은 음식:
${foods}

본인 정보 (선택): ${body?.profile || '미입력'}
목표: ${body?.goal || '균형식'}

영양 분석.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 2500, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
