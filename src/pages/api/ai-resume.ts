/**
 * /api/ai-resume — AI 이력서 작성·첨삭.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 채용 이력서 전문가입니다. 정보 → ATS 통과 + 직무 맞춤 이력서.

응답 JSON ONLY:
{
  "summary": "한 줄 자기 PR",
  "atsScore": 0-100,
  "sections": {
    "profile": "프로필 섹션 (3-4줄)",
    "skills": ["기술 1", ...],
    "experience": [{"company":"회사","role":"직책","period":"기간","bullets":["성과 1 (수치 포함)"]}],
    "education": ["학력 1", ...],
    "projects": [{"name":"프로젝트","desc":"설명","tech":"기술"}],
    "certifications": ["자격증 1", ...]
  },
  "improvements": ["개선 제안 1", ...],
  "keywordsToAdd": ["JD 매칭 키워드 1", ...],
  "redFlags": ["피해야 할 표현 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const info = (body?.info || '').toString().trim();
  const targetRole = body?.targetRole || '';
  const jd = body?.jd || '';
  if (info.length < 50) return new Response(JSON.stringify({ ok: false, error: '경력 정보 50자 이상' }), { status: 400 });
  const userMsg = `타겟 직무: ${targetRole}
JD: ${jd || '미입력'}

[경력 정보]
${info}

위 정보로 ATS 통과형 이력서 작성.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 3500, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
