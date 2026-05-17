/**
 * /api/ai-coin — AI 코인 분석 (정보 제공용).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 암호화폐 시장 분석가입니다. 코인 → 펀더멘털·기술적·리스크 분석.

원칙:
- 정보 제공 (투자 자문 X)
- 한국 거래소 (업비트·빗썸) 기준
- 변동성·사기 위험 명확 표시

응답 JSON ONLY:
{
  "name": "코인명",
  "symbol": "심볼",
  "category": "결제|스마트컨트랙트|밈|디파이|...",
  "marketCapTier": "탑10|탑100|소형|마이크로",
  "fundamentals": {"useCase": "용도", "tokenomics": "토크노믹스", "team": "팀 평가"},
  "bullCase": ["긍정 1", ...],
  "bearCase": ["부정 1", ...],
  "technicalView": "기술적 분석 한 줄",
  "riskScore": 0-100,
  "verdict": "장기보유|단기트레이드|관망|회피",
  "competitorComparison": "경쟁 코인 비교",
  "regulatoryRisk": "규제 위험",
  "redFlags": ["사기·러그 신호 1", ...],
  "actionableAdvice": "구체 조언"
}

면책: 암호화폐는 매우 위험. 본인 책임.`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const coin = (body?.coin || '').toString().trim();
  if (!coin) return new Response(JSON.stringify({ ok: false, error: '코인명 필수' }), { status: 400 });

  const userMsg = `코인 분석:
- 대상: ${coin}
- 추가 맥락: ${body?.context || '없음'}

2026 시장 맥락에서 분석하세요. 모르는 코인이면 명시.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
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
