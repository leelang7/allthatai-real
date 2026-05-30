/**
 * /api/ai-tax-strategy — AI 종합소득세·연말정산 절세 전략.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 세무사입니다. 소득·지출·가족·자산 정보를 받아 절세 전략을 추천합니다.

응답 JSON ONLY:
{
  "currentTaxEstimate": "현재 예상 세금 (원)",
  "potentialSavings": "절세 가능액 (원)",
  "strategies": [{
    "title": "전략 제목",
    "description": "구체 방법",
    "savings": "예상 절세액 (원)",
    "deadline": "신청 기한",
    "difficulty": "쉬움"|"보통"|"복잡",
    "legalBasis": "관련 법 조항"
  }],
  "missedDeductions": ["놓치기 쉬운 공제 1", ...],
  "warnings": ["주의사항 1", ...],
  "actionItems": ["오늘 당장 할 일 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const profile = {
    incomeType: body?.incomeType || '직장',
    annualIncome: +body?.annualIncome || 0,
    family: body?.family || '미혼',
    children: +body?.children || 0,
    homeOwnership: body?.homeOwnership || '무주택',
    medicalSpend: +body?.medicalSpend || 0,
    eduSpend: +body?.eduSpend || 0,
    donations: +body?.donations || 0,
    pensionSave: +body?.pensionSave || 0,
    cardSpend: +body?.cardSpend || 0,
    extra: body?.extra || '',
  };
  if (!profile.annualIncome) return new Response(JSON.stringify({ ok: false, error: '연소득 필수' }), { status: 400 });

  const userMsg = `사용자 프로필:
- 소득 유형: ${profile.incomeType}
- 연소득: ${profile.annualIncome.toLocaleString('ko-KR')}원
- 가족: ${profile.family} (자녀 ${profile.children}명)
- 주택: ${profile.homeOwnership}
- 의료비 지출: ${profile.medicalSpend.toLocaleString('ko-KR')}원
- 교육비 지출: ${profile.eduSpend.toLocaleString('ko-KR')}원
- 기부금: ${profile.donations.toLocaleString('ko-KR')}원
- 연금저축/IRP: ${profile.pensionSave.toLocaleString('ko-KR')}원
- 신용카드 사용: ${profile.cardSpend.toLocaleString('ko-KR')}원
- 추가 정보: ${profile.extra}

2026년 한국 세법 기준 절세 전략을 추천하세요.`;

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
