/**
 * /api/ai-car — AI 차량 추천.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 자동차 전문가입니다. 예산·용도·가족 → 차량 5개 추천.

응답 JSON ONLY:
{
  "recommendations": [{
    "rank": 1-5,
    "model": "차량명 (예: 현대 그랜저)",
    "category": "세단|SUV|해치백|미니밴|EV|하이브리드",
    "priceRange": "신차 가격 (원)",
    "usedPrice": "중고 적정가 (원)",
    "matchScore": 0-100,
    "pros": ["장점 1", ...],
    "cons": ["단점 1", ...],
    "fuelEconomy": "연비 (km/L)",
    "maintenance": "유지비 평가",
    "annualCost": "예상 연 유지비 (원, 보험+세금+연료)"
  }],
  "summary": "추천 분석",
  "newVsUsed": "신차 vs 중고차 조언",
  "financing": "할부·리스 vs 일시불 조언",
  "warnings": ["주의 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    budget: +body?.budget || 0,
    usage: body?.usage || 'commute',
    passengers: +body?.passengers || 2,
    fuelType: body?.fuelType || 'any',
    newOrUsed: body?.newOrUsed || 'either',
    priorities: body?.priorities || '',
  };
  if (!p.budget) return new Response(JSON.stringify({ ok: false, error: '예산 필수' }), { status: 400 });
  const userMsg = `차량 추천:
- 예산: ${p.budget.toLocaleString('ko-KR')}원
- 용도: ${p.usage}
- 탑승 인원: ${p.passengers}명
- 연료: ${p.fuelType}
- 신차/중고: ${p.newOrUsed}
- 우선순위: ${p.priorities}

2026 한국 시장에서 5개 추천.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 3000, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
