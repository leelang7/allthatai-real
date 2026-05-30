/**
 * /api/ai-outfit — AI 코디 추천.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 패션 스타일리스트입니다. 체형·상황·예산 → 코디 3개.

응답 JSON ONLY:
{
  "bodyAnalysis": "체형 분석",
  "outfits": [{
    "name": "코디명",
    "occasion": "상황",
    "items": [{"category":"상의|하의|아우터|신발|가방|액세서리","item":"아이템","brand":"추천 브랜드","price":"가격 범위 (원)"}],
    "totalPrice": "총 비용",
    "stylePoints": ["포인트 1", ...],
    "avoidThese": ["피할 것 1", ...]
  }],
  "colorPalette": ["추천 색 1", ...],
  "seasonalTips": ["계절 팁 1", ...],
  "shoppingPlatforms": ["추천 플랫폼 1 (무신사·29CM·W컨셉 등)"]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    gender: body?.gender || '',
    age: +body?.age || 0,
    height: +body?.height || 0,
    weight: +body?.weight || 0,
    bodyType: body?.bodyType || '',
    occasion: body?.occasion || '데일리',
    season: body?.season || '',
    budget: +body?.budget || 0,
    style: body?.style || '',
  };
  if (!p.gender || !p.occasion) return new Response(JSON.stringify({ ok: false, error: '성별·상황 필수' }), { status: 400 });
  const userMsg = `코디 요청:
- ${p.gender} ${p.age}세 ${p.height}cm ${p.weight}kg
- 체형: ${p.bodyType || '미입력'}
- 상황: ${p.occasion}
- 계절: ${p.season || '현재'}
- 예산: ${p.budget.toLocaleString('ko-KR')}원
- 선호 스타일: ${p.style || '미입력'}`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 3000, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
