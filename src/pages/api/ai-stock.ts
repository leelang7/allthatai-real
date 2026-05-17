/**
 * /api/ai-stock — AI 주식 종목 분석.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 주식 분석가입니다. 종목 정보 → 투자 적합성 분석 (보유 vs 매수 vs 매도).

원칙:
- 한국·미국 주식 모두 가능
- 재무지표·산업 트렌드·기술적 분석 균형
- 투자 자문 아닌 "정보 분석" (면책)

응답 JSON ONLY:
{
  "ticker": "티커",
  "companyName": "회사명",
  "recommendation": "강력매수|매수|보유|매도|강력매도",
  "targetPrice": "12개월 목표가 (원/달러)",
  "fairValueRange": {"low": 가격, "high": 가격},
  "thesis": "투자 의견 한 줄",
  "bullCase": ["긍정 요인 1", ...],
  "bearCase": ["부정 요인 1", ...],
  "keyMetrics": {"PER": "값", "PBR": "값", "ROE": "값", "배당수익률": "값"},
  "catalysts": ["가까운 미래 트리거 1", ...],
  "risks": ["주요 위험 1", ...],
  "competitiveLandscape": "경쟁 환경 한 줄",
  "verdict": "투자 적합성 종합"
}

면책: 정보 제공용. 실제 매매는 본인 책임.`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const ticker = (body?.ticker || '').toString().trim();
  const market = body?.market || 'kr';
  const horizon = body?.horizon || 'medium';
  const additionalContext = body?.additionalContext || '';
  if (!ticker) return new Response(JSON.stringify({ ok: false, error: '티커 필수' }), { status: 400 });

  const userMsg = `종목 분석 요청:
- 티커/종목명: ${ticker}
- 시장: ${market === 'us' ? '미국' : market === 'jp' ? '일본' : '한국 (KOSPI/KOSDAQ)'}
- 투자 기간: ${horizon === 'short' ? '단기 (3개월 이내)' : horizon === 'long' ? '장기 (3년+)' : '중기 (1년)'}
- 추가 맥락: ${additionalContext}

위 종목의 투자 분석을 제공하세요.`;

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
