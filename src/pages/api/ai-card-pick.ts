/**
 * /api/ai-card-pick — AI 신용카드 추천 (지출 패턴 기반).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 신용카드·체크카드 전문가입니다. 지출 패턴 → 최적 카드 추천.

응답 JSON ONLY:
{
  "annualBenefit": "예상 연 혜택 (원)",
  "recommendations": [{
    "rank": 1-5,
    "cardName": "카드명 (대표 카드 예시)",
    "issuer": "발급사",
    "annualBenefit": "예상 연 혜택 (원)",
    "matchScore": 0-100,
    "keyBenefits": ["주요 혜택 1", ...],
    "requirements": "조건 (실적 등)",
    "fees": "연회비 (원)",
    "drawbacks": ["단점 1", ...]
  }],
  "spendingAnalysis": "지출 패턴 분석 한 줄",
  "tips": ["카드 활용 팁 1", ...],
  "avoidThese": ["피해야 할 패턴 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    monthlyTotal: +body?.monthlyTotal || 0,
    food: +body?.food || 0,
    transport: +body?.transport || 0,
    shopping: +body?.shopping || 0,
    online: +body?.online || 0,
    fuel: +body?.fuel || 0,
    streaming: +body?.streaming || 0,
    travel: +body?.travel || 0,
    cafe: +body?.cafe || 0,
    other: +body?.other || 0,
    preference: body?.preference || 'cashback',
  };
  if (!p.monthlyTotal) return new Response(JSON.stringify({ ok: false, error: '월 지출 필수' }), { status: 400 });

  const userMsg = `월 지출 패턴 (총 ${p.monthlyTotal.toLocaleString('ko-KR')}원):
- 식비: ${p.food.toLocaleString('ko-KR')}
- 교통/대중교통: ${p.transport.toLocaleString('ko-KR')}
- 쇼핑/마트: ${p.shopping.toLocaleString('ko-KR')}
- 온라인 쇼핑: ${p.online.toLocaleString('ko-KR')}
- 주유: ${p.fuel.toLocaleString('ko-KR')}
- 스트리밍 (넷플릭스·유튜브 등): ${p.streaming.toLocaleString('ko-KR')}
- 여행/항공: ${p.travel.toLocaleString('ko-KR')}
- 카페: ${p.cafe.toLocaleString('ko-KR')}
- 기타: ${p.other.toLocaleString('ko-KR')}
- 선호: ${p.preference === 'mileage' ? '항공 마일리지' : p.preference === 'point' ? '포인트' : '캐시백/할인'}

2026 한국 시장에서 최적 카드 5개 추천.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000, responseMimeType: 'application/json' },
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
