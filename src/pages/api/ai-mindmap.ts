/**
 * /api/ai-mindmap — AI 마인드맵·아이디어 구조화.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 학습·기획 코치입니다. 주제 → 마인드맵 + 하위 노드.

응답 JSON ONLY:
{
  "central": "중심 주제",
  "branches": [{
    "label": "1차 가지",
    "children": [{"label": "2차 노드", "details": "설명"}]
  }],
  "keyInsights": ["핵심 인사이트 1", ...],
  "actionableSteps": ["실행 단계 1", ...],
  "relatedTopics": ["관련 주제 1", ...],
  "questionsToExplore": ["탐구 질문 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const topic = (body?.topic || '').toString().trim();
  const purpose = body?.purpose || 'learning';
  const depth = +body?.depth || 3;
  if (!topic) return new Response(JSON.stringify({ ok: false, error: '주제 필수' }), { status: 400 });
  const userMsg = `마인드맵 생성:
- 주제: ${topic}
- 목적: ${purpose === 'learning' ? '학습' : purpose === 'planning' ? '기획' : purpose === 'brainstorm' ? '브레인스토밍' : '문제해결'}
- 깊이: 1차 가지 ${depth}~5개, 각 2차 노드 3~5개

체계적 마인드맵.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 3000, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
