/**
 * /api/ai-fortune — AI 사주·운세 (정보 제공용).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 사주명리·점성학 풀이가입니다. 생년월일·관심사 → 사주 풀이.

원칙:
- 엔터테인먼트·자기성찰 도구 (의학·법률·재무 결정 X)
- 부정적 운명론 회피
- 한국 사주명리 + 일반 점성학

응답 JSON ONLY:
{
  "summary": "한 줄 사주 평",
  "elements": {"오행": "목·화·토·금·수 분포 분석"},
  "strengths": ["강점 1", ...],
  "weaknesses": ["주의 영역 1", ...],
  "career": "직업운",
  "wealth": "재물운",
  "love": "애정운",
  "health": "건강운",
  "thisYear": "올해 (2026) 흐름",
  "luckyMonths": [1-12],
  "luckyColors": ["색 1", ...],
  "luckyDirections": ["방향 1", ...],
  "advice": ["조언 1", ...]
}

엔터테인먼트 면책 포함.`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    birthDate: body?.birthDate || '',
    birthTime: body?.birthTime || '',
    gender: body?.gender || '',
    focus: body?.focus || 'all',
  };
  if (!p.birthDate) return new Response(JSON.stringify({ ok: false, error: '생년월일 필수' }), { status: 400 });

  const userMsg = `사주 풀이:
- 생년월일: ${p.birthDate}
- 출생 시간: ${p.birthTime || '미입력'}
- 성별: ${p.gender || '미입력'}
- 관심사: ${p.focus === 'career' ? '직업·재물' : p.focus === 'love' ? '애정·결혼' : p.focus === 'health' ? '건강' : '전반'}

엔터테인먼트 목적 사주 풀이.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2500, responseMimeType: 'application/json' },
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
