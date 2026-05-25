/**
 * /api/ai-dispute — AI 부동산 분쟁 법적 해결 가이드.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 부동산 분쟁 변호사입니다. 분쟁 상황 → 법적 해결 단계·증거·예상 비용·소요 시간.

응답 JSON ONLY:
{
  "legalAssessment": "법적 평가 (한 줄)",
  "winProbability": "승소 가능성 (낮음|보통|높음|매우 높음)",
  "applicableLaw": ["관련 법 조항 1", ...],
  "evidence": ["수집할 증거 1", ...],
  "steps": [{
    "stage": "1차 협상|내용증명|조정|소송|...",
    "action": "구체 행동",
    "duration": "소요 기간",
    "cost": "예상 비용 (원)",
    "outcome": "예상 결과"
  }],
  "estimatedTotalCost": "전체 예상 비용 (원)",
  "estimatedDuration": "전체 소요 기간",
  "alternatives": ["소송 외 대안 1", ...],
  "freeResources": ["무료 법률 자원 1 (예: 법률구조공단 132)", ...],
  "warnings": ["주의사항 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const disputeType = (body?.disputeType || '').toString();
  const situation = (body?.situation || '').toString();
  const amount = +body?.amount || 0;
  const role = body?.role || 'tenant';
  if (situation.length < 30) return new Response(JSON.stringify({ ok: false, error: '상황 30자 이상' }), { status: 400 });

  const userMsg = `분쟁 정보:
- 분쟁 유형: ${disputeType}
- 내 입장: ${role === 'tenant' ? '임차인' : role === 'landlord' ? '임대인' : role === 'buyer' ? '매수인' : '매도인'}
- 분쟁 금액: ${amount ? amount.toLocaleString('ko-KR') + '원' : '미입력'}
- 구체 상황:
${situation}

한국 부동산법 기준으로 해결 단계·증거·비용·시간을 분석하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000, responseMimeType: 'application/json' },
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
