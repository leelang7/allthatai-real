/**
 * /api/ai-music — AI 음악·플레이리스트 추천.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 음악 큐레이터입니다. 기분·상황·취향 → 플레이리스트 15곡.

응답 JSON ONLY:
{
  "playlistName": "플레이리스트 이름",
  "vibe": "분위기 한 줄",
  "tracks": [{"title":"곡명","artist":"아티스트","genre":"장르","year":연도,"reason":"추천 이유"}],
  "totalMinutes": 숫자,
  "moodFlow": "감정 흐름",
  "platforms": [{"name":"플랫폼 (멜론·스포티파이·유튜브 뮤직)","link":"검색 URL 또는 가이드"}],
  "similarArtists": ["유사 아티스트 1", ...],
  "alternativeVibe": "다른 분위기 시도해보세요"
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    mood: body?.mood || '',
    situation: body?.situation || '',
    genres: body?.genres || '',
    favoriteArtists: body?.favoriteArtists || '',
    era: body?.era || 'any',
    language: body?.language || 'mixed',
  };
  if (!p.mood && !p.situation) return new Response(JSON.stringify({ ok: false, error: '기분 또는 상황 필수' }), { status: 400 });
  const userMsg = `음악 추천:
- 기분: ${p.mood}
- 상황: ${p.situation}
- 좋아하는 장르: ${p.genres}
- 좋아하는 아티스트: ${p.favoriteArtists}
- 시대: ${p.era}
- 언어: ${p.language === 'kpop' ? '한국' : p.language === 'pop' ? '팝' : p.language === 'jpop' ? '일본' : '혼합'}

15곡 플레이리스트.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 3000, responseMimeType: 'application/json' } }) });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); } catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 }); }
};
