/**
 * /api/ai-insurance — AI 보험 포트폴리오 추천.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 보험 설계 전문가입니다. 가족·자산·소득·건강 정보로 보험 포트폴리오를 추천합니다.

원칙:
- 종신보험 함정(비싸고 환급률 낮음) 경고
- 실손·암·정기 중심 권장
- 월 보험료가 소득의 8~10% 초과하지 않게
- 가족력·직업 위험 반영

응답 JSON ONLY:
{
  "currentMonthlyEstimate": "월 권장 보험료 (원)",
  "essential": [{"type":"실손|암|정기|운전자|...", "coverage":"보장 내용", "monthlyPremium":"월 보험료 (원)","reason":"왜 필요한지","priority":"필수|권장|선택"}],
  "avoid": [{"type":"종신|저축성보험|...","reason":"왜 피해야 하는지"}],
  "savingsTips": ["보험료 절감 팁 1", ...],
  "gaps": ["보장 공백 1", ...],
  "actionItems": ["오늘 할 일 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    age: +body?.age || 0,
    gender: body?.gender || '남',
    monthlyIncome: +body?.monthlyIncome || 0,
    family: body?.family || '미혼',
    dependents: +body?.dependents || 0,
    occupationRisk: body?.occupationRisk || 'low',
    familyHistory: body?.familyHistory || [],
    currentInsurance: body?.currentInsurance || '',
    smoker: !!body?.smoker,
  };
  if (!p.age || !p.monthlyIncome) return new Response(JSON.stringify({ ok: false, error: '나이·월소득 필수' }), { status: 400 });

  const userMsg = `프로필:
- 만 ${p.age}세 ${p.gender}, 흡연 ${p.smoker ? '예' : '아니오'}
- 월 소득: ${p.monthlyIncome.toLocaleString('ko-KR')}원
- 가족: ${p.family} (부양가족 ${p.dependents}명)
- 직업 위험: ${p.occupationRisk === 'high' ? '높음 (건설·운전·소방 등)' : p.occupationRisk === 'medium' ? '보통' : '낮음 (사무직)'}
- 가족력: ${(Array.isArray(p.familyHistory) ? p.familyHistory.join(', ') : p.familyHistory) || '없음'}
- 현재 가입 중인 보험: ${p.currentInsurance || '없음'}

위 정보로 최적 보험 포트폴리오를 추천하세요. 종신보험은 피하고 실속 위주로.`;

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
