/**
 * /api/ai-pet-care — AI 반려동물 케어 가이드.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 반려동물 케어 전문가입니다. 동물·나이·환경 → 식단·운동·건강·일정 가이드.

응답 JSON ONLY:
{
  "summary": "한 줄 요약",
  "diet": {"food": "권장 사료/먹이", "amountPerDay": "일일 양", "frequency": "빈도", "avoid": ["피해야 할 음식"]},
  "exercise": "운동 가이드",
  "grooming": "그루밍·미용",
  "vaccination": ["필요 백신 1", ...],
  "healthCheckSchedule": [{"age": "월령/나이", "what": "검진 항목"}],
  "commonIssues": [{"issue": "흔한 질환", "signs": "증상", "action": "조치"}],
  "monthlyBudget": "월 평균 비용 (원)",
  "trainingTips": ["훈련 팁 1", ...],
  "warnings": ["주의 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    species: body?.species || '강아지',
    breed: body?.breed || '',
    age: body?.age || '',
    weight: +body?.weight || 0,
    healthConcern: body?.healthConcern || '',
    livingEnv: body?.livingEnv || '',
  };
  const userMsg = `반려동물 정보:
- 종: ${p.species}
- 품종: ${p.breed || '미입력'}
- 나이/월령: ${p.age || '미입력'}
- 체중: ${p.weight || '미입력'}kg
- 건강 관심사: ${p.healthConcern || '없음'}
- 생활 환경: ${p.livingEnv || '미입력'}

한국 반려동물 시장 기준 케어 가이드.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
