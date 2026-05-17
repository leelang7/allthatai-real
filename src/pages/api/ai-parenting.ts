/**
 * /api/ai-parenting — AI 자녀 교육·발달 가이드.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 아동 발달·교육 전문가입니다. 자녀 나이·고민 → 발달 단계·학습·생활 가이드.

응답 JSON ONLY:
{
  "developmentalStage": "현재 발달 단계 요약",
  "milestones": {"인지":"발달 지표","언어":"","사회성":"","운동":""},
  "learningRecommendations": [{"area":"한글|영어|수학|기타","method":"방법","resources":["자료 1"]}],
  "dailyRoutine": "권장 일일 루틴",
  "diet": "식단 가이드",
  "screenTime": "권장 화면 시간",
  "behaviorTips": ["행동 지도 팁 1", ...],
  "redFlags": ["발달 우려 신호 1", ...],
  "parentalSelfCare": "부모 자기 관리",
  "monthlyBudget": "월 양육 예산 (원)"
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    childAge: body?.childAge || '',
    childGender: body?.childGender || '',
    personality: body?.personality || '',
    concerns: body?.concerns || '',
    educationGoals: body?.educationGoals || '',
    workingParent: !!body?.workingParent,
  };
  if (!p.childAge) return new Response(JSON.stringify({ ok: false, error: '자녀 나이 필수' }), { status: 400 });

  const userMsg = `자녀 정보:
- 나이: ${p.childAge}
- 성별: ${p.childGender || '미입력'}
- 성격: ${p.personality || '미입력'}
- 고민·관심사: ${p.concerns || '없음'}
- 교육 목표: ${p.educationGoals || '미입력'}
- 부모 맞벌이: ${p.workingParent ? '예' : '아니오'}

한국 양육 환경 기준 가이드.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
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
