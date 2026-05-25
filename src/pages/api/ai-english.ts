/**
 * /api/ai-english — AI 영어 회화 / 번역 / 첨삭.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 영어 교사·번역가입니다. 한국어/영어 → 자연스러운 번역 + 회화 표현 + 문법 첨삭.

응답 JSON ONLY:
{
  "primaryTranslation": "주 번역",
  "alternatives": [{"version":"버전","tone":"formal|casual|business|친근","whenToUse":"용법"}],
  "grammarNotes": ["문법 포인트 1", ...],
  "vocabulary": [{"word":"단어","meaning":"의미","example":"예문"}],
  "pronunciation": "발음 가이드 (필요시)",
  "culturalNote": "문화적 주의점",
  "commonMistakes": ["한국인 흔한 실수 1", ...],
  "practiceConversation": [{"speaker":"A","text":"대화"}],
  "naturalness": 0-100,
  "betterRewrite": "더 자연스러운 표현 (영작 첨삭 시)"
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const text = (body?.text || '').toString().trim();
  const mode = body?.mode || 'translate';
  const direction = body?.direction || 'ko-en';
  const situation = body?.situation || '';
  if (!text) return new Response(JSON.stringify({ ok: false, error: '텍스트 필수' }), { status: 400 });

  const modeLabel = mode === 'translate' ? '번역' : mode === 'correct' ? '영작 첨삭' : mode === 'conversation' ? '회화 연습' : '표현 추천';
  const userMsg = `[${modeLabel}] (${direction === 'ko-en' ? '한→영' : '영→한'})
원문: ${text}
상황·맥락: ${situation}

자연스러운 번역 + 대안 + 문법 + 어휘 + 회화.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 2500, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
