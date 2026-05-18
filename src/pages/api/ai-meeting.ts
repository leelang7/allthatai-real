/**
 * /api/ai-meeting — AI 회의록 정리 (메모 → 구조화).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 비즈니스 회의록 작성자입니다. 메모/녹취록 → 구조화된 회의록.

응답 JSON ONLY:
{
  "title": "회의 제목",
  "summary": "한 줄 요약",
  "keyDecisions": ["결정사항 1", ...],
  "actionItems": [{"task":"할 일","assignee":"담당자","deadline":"기한"}],
  "discussionPoints": [{"topic":"주제","summary":"논의 내용","outcome":"결론"}],
  "openQuestions": ["미해결 질문 1", ...],
  "nextMeeting": "다음 회의 안건",
  "blockers": ["블로커 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const notes = (body?.notes || '').toString().trim();
  if (notes.length < 50) return new Response(JSON.stringify({ ok: false, error: '메모 50자 이상' }), { status: 400 });
  const userMsg = `회의 메모/녹취:
${notes}

회의 주제: ${body?.context || '미입력'}
참석자: ${body?.attendees || '미입력'}

위 메모를 구조화.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 3000, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
