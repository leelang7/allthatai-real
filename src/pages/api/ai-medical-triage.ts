/**
 * /api/ai-medical-triage — AI 진료과 추천 (증상 → 적합 과).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 의료 안내 전문가입니다. 증상 → 적합한 진료과·필요 검사·응급 판단.

원칙:
- 의학적 진단 X. 진료과 안내만.
- 응급 상황 ("119 즉시") 명확히 판단.
- 비전문가도 이해할 한국어.
- 보험·비급여 안내 포함.

응답 JSON ONLY:
{
  "urgency": "응급 (119)|당일 진료|이번 주|일반",
  "primaryDepartment": "1차 추천 과",
  "alternativeDepartments": ["대안 과 1", ...],
  "facilityType": "동네 의원|2차 병원|3차 종합병원",
  "suggestedTests": ["필요 검사 1", ...],
  "possibleConditions": ["가능 질환 1 (확진 X)", ...],
  "homeRemedies": ["집에서 할 수 있는 것 1", ...],
  "redFlags": ["즉시 응급실 가야 할 신호 1", ...],
  "insuranceTips": ["건강보험·실손 적용 팁 1", ...],
  "questionsToAsk": ["의사에게 물어볼 것 1", ...],
  "estimatedCost": "예상 비용 (원, 보험 적용 후)"
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    symptoms: (body?.symptoms || '').toString(),
    duration: body?.duration || '',
    age: +body?.age || 0,
    gender: body?.gender || '',
    conditions: body?.conditions || '',
    medications: body?.medications || '',
  };
  if (p.symptoms.length < 10) return new Response(JSON.stringify({ ok: false, error: '증상 10자 이상' }), { status: 400 });

  const userMsg = `증상 정보:
- 증상: ${p.symptoms}
- 지속 기간: ${p.duration || '미입력'}
- 나이: ${p.age || '미입력'}
- 성별: ${p.gender || '미입력'}
- 기저 질환: ${p.conditions || '없음'}
- 복용 약물: ${p.medications || '없음'}

진료과 안내 + 응급도 판단 + 가능 질환.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2500, responseMimeType: 'application/json' },
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
