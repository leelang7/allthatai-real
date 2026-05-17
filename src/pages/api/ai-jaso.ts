/**
 * /api/ai-jaso — AI 자기소개서 첨삭.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 채용 자기소개서 첨삭 전문가입니다. 항목별 점수 + 구체 개선안.

응답 JSON ONLY:
{
  "overallScore": 0-100,
  "verdict": "우수"|"양호"|"보완 필요"|"재작성 권장",
  "summary": "한 줄 평",
  "scores": {"구체성": 0-20, "직무적합도": 0-20, "차별화": 0-20, "구조": 0-20, "한국어": 0-20},
  "strengths": ["강점 1", ...],
  "weaknesses": [{"issue":"문제점","suggestion":"구체 개선안"}],
  "rewriteSuggestion": "더 강력한 첫 문장 제안",
  "missingElements": ["보강할 요소 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const text = (body?.text || '').toString().trim();
  const jobTitle = (body?.jobTitle || '').toString();
  const question = (body?.question || '').toString();
  if (text.length < 100) return new Response(JSON.stringify({ ok: false, error: '자소서 100자 이상' }), { status: 400 });
  if (text.length > 5000) return new Response(JSON.stringify({ ok: false, error: '5,000자 초과' }), { status: 400 });

  const userMsg = `지원 직무: ${jobTitle || '미지정'}
자소서 문항: ${question || '미지정'}

[자소서 본문]
${text}

위 자소서를 첨삭하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: 'application/json' },
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
