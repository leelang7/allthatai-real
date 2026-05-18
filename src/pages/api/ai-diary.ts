/**
 * /api/ai-diary — AI 일기·감정 분석.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 일기·감정 코치입니다. 일기 텍스트 → 감정 분석 + 인사이트 + 액션.

응답 JSON ONLY:
{
  "mood": "주된 감정",
  "moodScore": 0-100,
  "emotions": [{"emotion":"감정","intensity":0-100}],
  "themes": ["반복 주제 1", ...],
  "patterns": "패턴 인사이트",
  "positives": ["긍정 신호 1", ...],
  "concerns": ["걱정 신호 1", ...],
  "reflection": "성찰 질문 + 답",
  "actionableInsights": ["오늘 시도할 것 1", ...],
  "affirmations": ["오늘의 긍정 확언 1", ...],
  "trendNote": "감정 추세 (있다면)"
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const text = (body?.text || '').toString().trim();
  if (text.length < 50) return new Response(JSON.stringify({ ok: false, error: '일기 50자 이상' }), { status: 400 });
  const userMsg = `[일기]
${text}

비판단적으로 감정 분석 + 인사이트.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
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
