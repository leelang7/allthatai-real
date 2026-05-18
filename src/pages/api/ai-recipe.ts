/**
 * /api/ai-recipe — AI 레시피 추천 (재료 → 요리).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 요리 전문가입니다. 재료·제약 → 한식·일식·중식·양식 레시피.

응답 JSON ONLY:
{
  "recipes": [{
    "name": "요리명",
    "cuisine": "한식|일식|중식|양식|아시안",
    "difficulty": "쉬움|보통|어려움",
    "totalMinutes": 숫자,
    "servings": 숫자,
    "calories": "1인분 (kcal)",
    "ingredients": [{"name":"재료","amount":"양"}],
    "steps": ["1단계", ...],
    "tips": ["꿀팁 1", ...],
    "substitutes": [{"original":"재료","alternative":"대체"}]
  }],
  "suggestion": "구매할 추가 재료 추천",
  "warnings": ["주의 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const ingredients = (body?.ingredients || '').toString().trim();
  if (!ingredients) return new Response(JSON.stringify({ ok: false, error: '재료 필수' }), { status: 400 });
  const userMsg = `보유 재료: ${ingredients}
선호: ${body?.cuisine || '아무'}
시간: ${body?.maxMinutes || 30}분 이내
난이도: ${body?.difficulty || '쉬움'}
인분: ${body?.servings || 2}
제약: ${body?.restrictions || '없음'}

레시피 3개 추천.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 3000, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
