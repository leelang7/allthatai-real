/**
 * /api/ai-retirement — AI 노후 자금 시뮬레이터 + 전략.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 노후 재무 설계 전문가입니다. 현재 자산·저축 → 노후 자금 충분성 + 전략.

응답 JSON ONLY:
{
  "currentAge": 숫자,
  "retirementAge": 숫자,
  "yearsToRetirement": 숫자,
  "projectedTotalAtRetirement": "퇴직 시 예상 자산 (원)",
  "monthlyLivingCostNeeded": "월 필요 생활비 (원, 현재 가치)",
  "monthsCovered": "충당 가능 개월 (월)",
  "verdict": "충분|보통|부족|위험",
  "shortfallOrSurplus": "부족액 (-) or 잉여 (+) (원)",
  "strategies": [{
    "title": "전략",
    "action": "구체 행동",
    "expectedImpact": "예상 효과 (원)",
    "difficulty": "쉬움|보통|어려움"
  }],
  "currentPortfolio": "현재 자산 분배 평가",
  "recommendedAllocation": {"주식": "%", "채권": "%", "예금": "%", "부동산": "%", "연금": "%"},
  "warnings": ["주의 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    age: +body?.age || 0,
    retireAge: +body?.retireAge || 65,
    currentAssets: +body?.currentAssets || 0,
    monthlySaving: +body?.monthlySaving || 0,
    monthlyIncome: +body?.monthlyIncome || 0,
    targetMonthlyCost: +body?.targetMonthlyCost || 0,
    homeOwnership: body?.homeOwnership || '무주택',
    pensionEnrolled: body?.pensionEnrolled || [],
    lifeExpectancy: +body?.lifeExpectancy || 85,
  };
  if (!p.age) return new Response(JSON.stringify({ ok: false, error: '나이 필수' }), { status: 400 });

  const userMsg = `프로필:
- 만 ${p.age}세, 목표 은퇴 ${p.retireAge}세, 기대 수명 ${p.lifeExpectancy}세
- 현재 총 자산: ${p.currentAssets.toLocaleString('ko-KR')}원
- 월 소득: ${p.monthlyIncome.toLocaleString('ko-KR')}원, 월 저축: ${p.monthlySaving.toLocaleString('ko-KR')}원
- 노후 월 필요 생활비 (현재 가치): ${p.targetMonthlyCost ? p.targetMonthlyCost.toLocaleString('ko-KR') + '원' : '월 300만 가정'}
- 주택: ${p.homeOwnership}
- 가입 연금: ${(Array.isArray(p.pensionEnrolled) ? p.pensionEnrolled.join(', ') : p.pensionEnrolled) || '국민연금만'}

2026년 한국 기준 노후 자금 시뮬 + 전략. 인플레이션 연 2.5% 가정.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2500, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
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
