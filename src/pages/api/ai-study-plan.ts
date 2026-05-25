/**
 * /api/ai-study-plan — AI 학습 플래너 (시험·자격증·학습 목표).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 학습 코치입니다. 목표·기간·수준 → 학습 플랜 + 자료 + 일정.

응답 JSON ONLY:
{
  "totalWeeks": 숫자,
  "studyHoursPerWeek": 숫자,
  "phases": [{
    "weekRange": "1-4주",
    "focus": "집중 영역",
    "topics": ["주제 1", ...],
    "resources": ["추천 책/강의 1", ...],
    "milestones": ["체크포인트 1", ...]
  }],
  "dailySchedule": "권장 일일 일정",
  "weakAreaStrategy": "약한 영역 보강법",
  "tipsForRetention": ["기억 유지 팁 1", ...],
  "commonMistakes": ["흔한 실수 1", ...],
  "passingTips": ["합격 팁 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    goal: body?.goal || '',
    currentLevel: body?.currentLevel || 'beginner',
    targetDate: body?.targetDate || '',
    hoursPerDay: +body?.hoursPerDay || 2,
    weakAreas: body?.weakAreas || '',
    learningStyle: body?.learningStyle || 'mixed',
  };
  if (!p.goal) return new Response(JSON.stringify({ ok: false, error: '학습 목표 필수' }), { status: 400 });

  const userMsg = `학습 플랜 요청:
- 목표: ${p.goal}
- 현재 수준: ${p.currentLevel}
- 목표 날짜: ${p.targetDate || '미설정'}
- 하루 가용 시간: ${p.hoursPerDay}시간
- 약한 영역: ${p.weakAreas || '없음'}
- 학습 스타일: ${p.learningStyle}

상세 학습 플랜 (주차별).`;

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
