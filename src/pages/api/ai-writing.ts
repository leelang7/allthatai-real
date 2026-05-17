/**
 * /api/ai-writing — AI 글쓰기 첨삭 (이메일·블로그·SNS).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국어 글쓰기 코치입니다. 글 + 목적·톤 → 첨삭 + 개선안.

응답 JSON ONLY:
{
  "score": 0-100,
  "verdict": "우수|양호|보완|재작성",
  "summary": "한 줄 평",
  "strengths": ["강점 1", ...],
  "issues": [{"type":"문법|어휘|구조|톤","problem":"문제","fix":"수정안"}],
  "rewriteSample": "개선된 첫 문단 예시",
  "alternativeTones": [{"tone":"친근|격식|짧게","example":"예시"}],
  "seoTips": ["SEO 팁 1 (블로그용)", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const text = (body?.text || '').toString().trim();
  const purpose = body?.purpose || 'general';
  const tone = body?.tone || 'professional';
  if (text.length < 30) return new Response(JSON.stringify({ ok: false, error: '글 30자 이상' }), { status: 400 });

  const userMsg = `글쓰기 첨삭:
- 용도: ${purpose === 'email' ? '이메일' : purpose === 'blog' ? '블로그' : purpose === 'sns' ? 'SNS 게시물' : purpose === 'business' ? '비즈니스 문서' : '일반'}
- 목표 톤: ${tone === 'formal' ? '격식' : tone === 'friendly' ? '친근' : tone === 'persuasive' ? '설득' : '전문적'}

[원본]
${text}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2500, responseMimeType: 'application/json' },
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
