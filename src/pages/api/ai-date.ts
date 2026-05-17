/**
 * /api/ai-date — AI 데이트 코스 추천.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 데이트 코스 큐레이터입니다. 지역·예산·취향 → 시간순 코스.

응답 JSON ONLY:
{
  "courseTheme": "코스 컨셉",
  "totalBudget": "총 예산 (원, 2인)",
  "duration": "총 소요 시간",
  "stops": [{
    "order": 1,
    "time": "시간 (예: 12:00)",
    "name": "장소명",
    "type": "식당|카페|관광|체험|쇼핑",
    "duration": "체류 시간",
    "cost": "비용 (원)",
    "why": "추천 이유",
    "tip": "예약·꿀팁"
  }],
  "transportation": "이동 방법",
  "outfitTips": ["복장 팁 1", ...],
  "weatherBackup": ["우천 시 대안 1", ...],
  "conversationStarters": ["대화 주제 1", ...],
  "photoSpots": ["인생샷 장소 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    region: body?.region || '',
    budget: +body?.budget || 0,
    stage: body?.stage || 'dating',
    duration: body?.duration || 'halfday',
    time: body?.time || 'afternoon',
    interests: body?.interests || '',
    season: body?.season || '',
  };
  if (!p.region) return new Response(JSON.stringify({ ok: false, error: '지역 필수' }), { status: 400 });

  const userMsg = `데이트 코스:
- 지역: ${p.region}
- 예산 (2인 총): ${p.budget.toLocaleString('ko-KR')}원
- 관계 단계: ${p.stage === 'first' ? '첫 데이트' : p.stage === 'long' ? '오래된 연인' : '연애 중'}
- 길이: ${p.duration === 'short' ? '짧음 (3시간 이내)' : p.duration === 'fullday' ? '하루 종일' : '반나절'}
- 시간대: ${p.time}
- 관심사: ${p.interests || '일반'}
- 시기: ${p.season || '현재'}

구체 장소명 + 시간순 코스.`;

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
