/**
 * /api/ai-portfolio — AI 자산 포트폴리오 추천.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 자산 배분 전문가입니다. 자산·목표·위험 성향 → 포트폴리오 추천.

응답 JSON ONLY:
{
  "currentAnalysis": "현재 포트폴리오 평가",
  "riskTolerance": "분석된 위험 성향",
  "recommendedAllocation": {"주식": "%", "채권": "%", "예금/MMF": "%", "부동산": "%", "원자재(금)": "%", "암호화폐": "%"},
  "specificPicks": [{
    "category": "카테고리",
    "products": ["구체 상품 1 (예: KODEX 200 ETF)"],
    "weight": "%",
    "reason": "추천 이유"
  }],
  "rebalancing": "리밸런싱 주기·방법",
  "taxOptimization": ["세금 최적화 팁 1", ...],
  "warnings": ["주의 1", ...],
  "expectedReturn": "연 예상 수익률 (%)",
  "expectedVolatility": "변동성 평가"
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    totalAssets: +body?.totalAssets || 0,
    age: +body?.age || 0,
    goal: body?.goal || 'growth',
    horizon: body?.horizon || 'long',
    riskTolerance: body?.riskTolerance || 'moderate',
    currentAllocation: body?.currentAllocation || '',
    monthlyContribution: +body?.monthlyContribution || 0,
    incomeSource: body?.incomeSource || '근로소득',
  };
  if (!p.totalAssets) return new Response(JSON.stringify({ ok: false, error: '총 자산 필수' }), { status: 400 });

  const userMsg = `자산 포트폴리오 요청:
- 총 자산: ${p.totalAssets.toLocaleString('ko-KR')}원
- ${p.age}세, 소득원: ${p.incomeSource}
- 월 추가 투자: ${p.monthlyContribution.toLocaleString('ko-KR')}원
- 목표: ${p.goal === 'preservation' ? '자산 보존' : p.goal === 'income' ? '인컴 (배당·이자)' : p.goal === 'growth' ? '성장' : '균형'}
- 기간: ${p.horizon === 'short' ? '단기 (3년 이내)' : p.horizon === 'medium' ? '중기 (3~10년)' : '장기 (10년+)'}
- 위험 성향: ${p.riskTolerance}
- 현재 배분: ${p.currentAllocation || '미입력'}

2026 한국 시장 기준 포트폴리오 + 구체 상품.`;

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
