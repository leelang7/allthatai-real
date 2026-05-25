/**
 * /api/ai-travel — AI 여행 플래너.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 여행 플래너입니다. 목적지·기간·예산·인원 → 상세 일정 + 예산 분배.

응답 JSON ONLY:
{
  "destination": "목적지",
  "totalDays": 숫자,
  "totalBudget": "총 예산 (원)",
  "budgetBreakdown": {"숙박":"%","항공":"%","식사":"%","관광":"%","쇼핑":"%","교통":"%"},
  "itinerary": [{
    "day": 1,
    "theme": "Day 테마",
    "morning": "오전 활동",
    "afternoon": "오후 활동",
    "evening": "저녁 활동",
    "meals": {"breakfast":"추천","lunch":"추천","dinner":"추천"},
    "estimatedCost": "이날 비용 (원)"
  }],
  "mustEat": ["꼭 먹어야 할 음식 1", ...],
  "mustSee": ["꼭 봐야 할 곳 1", ...],
  "packingList": ["챙길 것 1", ...],
  "warnings": ["주의사항 1", ...],
  "savingTips": ["절감 팁 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    destination: body?.destination || '',
    days: +body?.days || 3,
    budget: +body?.budget || 0,
    travelers: +body?.travelers || 2,
    travelStyle: body?.travelStyle || 'balanced',
    interests: body?.interests || '',
    season: body?.season || '',
  };
  if (!p.destination) return new Response(JSON.stringify({ ok: false, error: '목적지 필수' }), { status: 400 });

  const userMsg = `여행 계획:
- 목적지: ${p.destination}
- 기간: ${p.days}일
- 예산 (총, 인당): ${p.budget.toLocaleString('ko-KR')}원
- 인원: ${p.travelers}명
- 스타일: ${p.travelStyle === 'budget' ? '가성비' : p.travelStyle === 'luxury' ? '럭셔리' : '균형'}
- 관심사: ${p.interests || '일반'}
- 시기: ${p.season || '미입력'}

한국인 시각에서 상세 일정.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 3500, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); }
    catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 });
  }
};
