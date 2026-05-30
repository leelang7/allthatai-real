/**
 * /api/ai-plant — AI 식물 케어.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 식물 큐레이터입니다. 식물·환경 → 케어 가이드.

응답 JSON ONLY:
{
  "plantName": "식물명",
  "difficulty": "쉬움|보통|어려움",
  "water": {"frequency": "주기", "amount": "양", "signs": "건조 신호"},
  "light": "빛 요구량",
  "temperature": "적정 온도",
  "humidity": "습도",
  "soil": "토양 권장",
  "fertilizer": "비료",
  "repotting": "분갈이 주기",
  "commonIssues": [{"issue":"문제","symptoms":"증상","solution":"해결"}],
  "pests": ["흔한 해충 1", ...],
  "isToxicToPets": true/false,
  "monthlySchedule": [{"month":"월","tasks":["할 일"]}],
  "tips": ["고급 팁 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = { plant: body?.plant || '', environment: body?.environment || '실내 거실', light: body?.light || 'medium', experience: body?.experience || 'beginner' };
  if (!p.plant) return new Response(JSON.stringify({ ok: false, error: '식물명 필수' }), { status: 400 });
  const userMsg = `식물 케어:
- 식물: ${p.plant}
- 환경: ${p.environment}
- 빛: ${p.light}
- 경험: ${p.experience}`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 2500, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
