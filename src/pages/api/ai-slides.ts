/**
 * /api/ai-slides — AI 발표 슬라이드 구조.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 프레젠테이션 코치입니다. 주제·청중 → 슬라이드 구조.

응답 JSON ONLY:
{
  "totalSlides": 숫자,
  "estimatedMinutes": 숫자,
  "slides": [{
    "number": 1,
    "type": "표지|목차|문제|해결책|데이터|사례|결론|Q&A",
    "title": "슬라이드 제목",
    "keyMessage": "핵심 메시지 1줄",
    "bullets": ["불릿 1", ...],
    "speakerNotes": "발표자 노트",
    "visualSuggestion": "그래프|이미지|아이콘 권장"
  }],
  "openingHook": "오프닝 후크",
  "closingMessage": "클로징",
  "qaPrep": [{"question":"예상 질문","answer":"답변"}],
  "designTips": ["디자인 팁 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = { topic: body?.topic || '', audience: body?.audience || '', purpose: body?.purpose || 'inform', duration: +body?.duration || 10, keyPoints: body?.keyPoints || '' };
  if (!p.topic) return new Response(JSON.stringify({ ok: false, error: '주제 필수' }), { status: 400 });
  const userMsg = `슬라이드 구조:
- 주제: ${p.topic}
- 청중: ${p.audience || '일반'}
- 목적: ${p.purpose}
- 발표 시간: ${p.duration}분
- 핵심 포인트: ${p.keyPoints || '미입력'}

청중 맞춤 슬라이드 구조 (1분당 1슬라이드 기준).`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
