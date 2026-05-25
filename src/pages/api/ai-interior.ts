/**
 * /api/ai-interior — AI 인테리어 가이드.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 인테리어 디자이너입니다. 평수·예산·취향 → 인테리어 플랜 + 가구·소재·동선.

응답 JSON ONLY:
{
  "styleSummary": "추천 스타일 한 줄",
  "colorPalette": ["주요 색상 1", ...],
  "totalBudget": "총 예산 (원)",
  "breakdown": [{"area":"거실|침실|주방|화장실|...","budget":"예산","keyItems":["핵심 가구·소품"],"tips":"공간별 팁"}],
  "furnitureList": [{"item":"가구","brand":"추천 브랜드 (이케아·한샘·LH 등)","price":"가격 범위"}],
  "spaceLayout": "동선·배치 조언",
  "lightingTips": ["조명 팁 1", ...],
  "diy": ["DIY 가능 항목 1", ...],
  "avoidThese": ["피해야 할 패턴 1", ...],
  "smallSpaceTricks": ["좁은 공간 활용법 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    pyeong: +body?.pyeong || 0,
    propertyType: body?.propertyType || '아파트',
    budget: +body?.budget || 0,
    style: body?.style || 'modern',
    occupants: body?.occupants || '신혼',
    priorities: body?.priorities || '',
    constraints: body?.constraints || '',
  };
  if (!p.pyeong || !p.budget) return new Response(JSON.stringify({ ok: false, error: '평수·예산 필수' }), { status: 400 });

  const userMsg = `인테리어 요청:
- 평수: ${p.pyeong}평 (${p.propertyType})
- 예산: ${p.budget.toLocaleString('ko-KR')}원
- 스타일: ${p.style}
- 거주: ${p.occupants}
- 우선순위: ${p.priorities || '미입력'}
- 제한: ${p.constraints || '없음'}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 3000, responseMimeType: 'application/json' },
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
