/**
 * /api/ai-region-match — 예산·라이프스타일 → 추천 지역.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 부동산·생활권 전문가입니다. 예산·라이프스타일 → 적합한 지역 5곳 추천.

응답 JSON ONLY:
{
  "regions": [{
    "name": "지역명 (구·동 단위)",
    "matchScore": 0-100,
    "estimatedPriceRange": {"sale": "매매가 범위", "jeonse": "전세가 범위"},
    "pros": ["장점 1", ...],
    "cons": ["단점 1", ...],
    "lifestyle": "생활 분위기 한 줄",
    "transport": "교통 평가",
    "schools": "학군 평가",
    "amenities": "편의시설 평가",
    "suitableFor": ["적합한 라이프스타일 1", ...]
  }],
  "summary": "본인 조건 분석 한 줄",
  "tradeoffs": ["고려해야 할 트레이드오프 1", ...],
  "alternatives": ["기준 완화 시 대안 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    budget: +body?.budget || 0,
    dealType: body?.dealType || 'sale',
    propertyType: body?.propertyType || '아파트',
    workplace: body?.workplace || '',
    commute: +body?.commute || 60,
    family: body?.family || '신혼',
    priorities: body?.priorities || [],
    avoidances: body?.avoidances || [],
    preferredAreas: body?.preferredAreas || '',
  };
  if (!p.budget) return new Response(JSON.stringify({ ok: false, error: '예산 필수' }), { status: 400 });

  const userMsg = `라이프스타일 매칭 요청:
- 예산: ${p.budget.toLocaleString('ko-KR')}원
- 거래: ${p.dealType === 'sale' ? '매매' : p.dealType === 'jeonse' ? '전세' : '월세'}
- 매물 유형: ${p.propertyType}
- 직장 위치: ${p.workplace || '미입력'}
- 최대 통근: ${p.commute}분
- 가족 구성: ${p.family}
- 우선순위: ${(Array.isArray(p.priorities) ? p.priorities.join(', ') : p.priorities) || '미입력'}
- 피하고 싶은 것: ${(Array.isArray(p.avoidances) ? p.avoidances.join(', ') : p.avoidances) || '없음'}
- 선호 지역 (있다면): ${p.preferredAreas || '없음'}

2026년 한국 시장 기준 적합 지역 5개를 추천하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 3000, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
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
