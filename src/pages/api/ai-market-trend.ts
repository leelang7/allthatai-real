/**
 * /api/ai-market-trend — AI 부동산 시장 트렌드 분석.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 부동산 시장 분석가입니다. 지역 + 기간 → 시장 동향 분석.

응답 JSON ONLY:
{
  "regionName": "지역명",
  "overallTrend": "상승|보합|하락",
  "trendStrength": "강함|보통|약함",
  "summary": "한 줄 요약",
  "priceChange": "지난 N개월 변동 (% 추정)",
  "supplyDemand": "수급 균형 분석",
  "drivers": [{"factor":"요인","impact":"긍정|부정","explanation":"설명"}],
  "demographics": "인구·세대 변화 영향",
  "infrastructure": "교통·개발 호재",
  "outlook": "향후 6~12개월 전망",
  "actionableAdvice": {"buyer":"매수자 조언","seller":"매도자 조언","tenant":"임차인 조언","landlord":"임대인 조언"},
  "risks": ["주요 위험 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const region = (body?.region || '').toString().trim();
  const propertyType = body?.propertyType || '아파트';
  const horizon = body?.horizon || '6m';
  if (!region) return new Response(JSON.stringify({ ok: false, error: '지역 필수' }), { status: 400 });

  const userMsg = `시장 분석 요청:
- 지역: ${region}
- 매물 유형: ${propertyType}
- 분석 기간: ${horizon === '3m' ? '최근 3개월' : horizon === '1y' ? '최근 1년' : '최근 6개월'} + 향후 6~12개월 전망

2026 한국 부동산 시장 맥락에서 분석하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2500, responseMimeType: 'application/json' },
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
