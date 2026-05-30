/**
 * /api/ai-workout — AI 운동·식단 플랜.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 헬스 트레이너·영양사입니다. 목표·신체·시간 → 운동 + 식단.

응답 JSON ONLY:
{
  "tdee": "일일 권장 칼로리 (kcal)",
  "targetCalories": "목표 칼로리 (kcal)",
  "macros": {"protein": "단백질 (g)", "carbs": "탄수화물 (g)", "fat": "지방 (g)"},
  "weeklySchedule": [{"day": "월", "type": "근력/유산소/휴식", "exercises": ["운동 1: 세트×횟수", ...], "duration": "분"}],
  "mealPlan": [{"meal": "아침", "options": ["옵션 1", ...], "calories": "kcal"}],
  "supplements": ["권장 보충제 1", ...],
  "tipsForResults": ["결과 팁 1", ...],
  "warnings": ["주의 1", ...],
  "timeline": "목표 달성 예상 기간"
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    goal: body?.goal || 'maintain',
    age: +body?.age || 0,
    gender: body?.gender || '남',
    height: +body?.height || 0,
    weight: +body?.weight || 0,
    activityLevel: body?.activityLevel || 'moderate',
    daysPerWeek: +body?.daysPerWeek || 3,
    timePerSession: +body?.timePerSession || 60,
    equipment: body?.equipment || 'gym',
    restrictions: body?.restrictions || '',
  };
  if (!p.weight || !p.height) return new Response(JSON.stringify({ ok: false, error: '신장·체중 필수' }), { status: 400 });

  const userMsg = `운동·식단 플랜:
- 목표: ${p.goal === 'fat-loss' ? '체지방 감량' : p.goal === 'muscle' ? '근육 증가' : p.goal === 'recomp' ? '재구성' : '유지'}
- ${p.age}세 ${p.gender}, ${p.height}cm, ${p.weight}kg
- 활동량: ${p.activityLevel}
- 주 ${p.daysPerWeek}일, 회당 ${p.timePerSession}분
- 환경: ${p.equipment === 'home' ? '홈트 (기구 X)' : p.equipment === 'home-eq' ? '홈트 (덤벨·밴드)' : '헬스장'}
- 제한사항: ${p.restrictions || '없음'}

상세 주간 운동 + 식단.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3500, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
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
