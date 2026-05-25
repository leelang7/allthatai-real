/**
 * /api/ai-wedding — AI 결혼 비용 시뮬·플래너.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 결혼 플래너입니다. 예산·인원·취향 → 항목별 추천 + 절감 전략.

응답 JSON ONLY:
{
  "totalBudget": "총 예산 (원)",
  "breakdown": [{
    "category": "예식장|드레스|스튜디오|메이크업|예물|혼수|허니문|식사|기타",
    "recommended": "권장 비용 (원)",
    "tips": ["팁 1", ...],
    "options": [{"tier":"저렴|중간|프리미엄", "price":"가격 범위"}]
  }],
  "timeline": [{"month": "결혼 N개월 전", "tasks": ["할 일 1", ...]}],
  "savingStrategies": ["절감 전략 1", ...],
  "scamWarnings": ["사기·과잉 청구 패턴 1", ...],
  "totalRange": {"low": "최저 (원)", "average": "평균", "luxury": "럭셔리"}
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    budget: +body?.budget || 0,
    guests: +body?.guests || 200,
    region: body?.region || '서울',
    style: body?.style || 'standard',
    monthsUntil: +body?.monthsUntil || 12,
    priorities: body?.priorities || '',
  };
  if (!p.budget) return new Response(JSON.stringify({ ok: false, error: '예산 필수' }), { status: 400 });

  const userMsg = `결혼 플래너:
- 총 예산: ${p.budget.toLocaleString('ko-KR')}원
- 하객: ${p.guests}명
- 지역: ${p.region}
- 스타일: ${p.style === 'minimal' ? '미니멀' : p.style === 'luxury' ? '럭셔리' : p.style === 'destination' ? '데스티네이션' : '표준'}
- 결혼까지: ${p.monthsUntil}개월
- 우선순위: ${p.priorities || '미입력'}

2026 한국 결혼 시장 기준.`;

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
