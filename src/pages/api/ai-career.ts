/**
 * /api/ai-career — AI 진로 상담.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 진로·커리어 코치입니다. 학력·관심·강점 → 직업 경로·전환 전략.

응답 JSON ONLY:
{
  "personalityFit": "직업 적성 분석",
  "topCareers": [{
    "title": "직업명",
    "matchScore": 0-100,
    "salaryRange": "연봉 범위 (원)",
    "growthOutlook": "성장 전망",
    "requiredSkills": ["기술 1", ...],
    "pathToEntry": "진입 경로",
    "yearsToReach": "도달 기간"
  }],
  "skillsToBuild": ["우선 습득 기술 1", ...],
  "certifications": ["추천 자격증 1", ...],
  "alternativePaths": ["대안 경로 1", ...],
  "actionItems": ["1개월 내 할 일 1", ...],
  "warnings": ["주의할 함정 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    age: +body?.age || 0,
    education: body?.education || '',
    currentJob: body?.currentJob || '',
    interests: body?.interests || '',
    strengths: body?.strengths || '',
    constraints: body?.constraints || '',
    incomeGoal: +body?.incomeGoal || 0,
  };
  if (!p.age) return new Response(JSON.stringify({ ok: false, error: '나이 필수' }), { status: 400 });
  const userMsg = `진로 상담:
- ${p.age}세
- 학력: ${p.education}
- 현재 직업: ${p.currentJob || '없음'}
- 관심사: ${p.interests}
- 강점: ${p.strengths}
- 제약: ${p.constraints || '없음'}
- 연봉 목표: ${p.incomeGoal.toLocaleString('ko-KR')}원

2026 한국 시장에서 적합 직업·경로.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 3000, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
