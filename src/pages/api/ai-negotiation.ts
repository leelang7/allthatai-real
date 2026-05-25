/**
 * /api/ai-negotiation — AI 부동산 협상 대본·전략.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 부동산 협상 전문가입니다. 매매·전월세 상황에서 임차인·매수인이 사용할 협상 대본·전략을 제시합니다.

응답 JSON ONLY:
{
  "leveragePoints": ["내가 가진 협상력 1", ...],
  "targetPrice": "현실적 목표 가격 (원)",
  "openingPrice": "처음 제안 가격 (원)",
  "walkAwayPrice": "더 못 양보할 한계 가격 (원)",
  "scripts": [{
    "phase": "탐색"|"제안"|"반박"|"마무리",
    "situation": "상황",
    "youSay": "당신이 할 말 (한국어 존댓말)",
    "expectedResponse": "상대 예상 반응",
    "counterMove": "대응책"
  }],
  "concessionStrategy": "양보 전략 (단계별)",
  "warnings": ["피해야 할 패턴 1", ...],
  "alternativeWins": ["가격 외 얻을 수 있는 것 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    dealType: body?.dealType || 'sale',
    askPrice: +body?.askPrice || 0,
    marketPrice: +body?.marketPrice || 0,
    propertyInfo: body?.propertyInfo || '',
    myPosition: body?.myPosition || '',
    sellerPosition: body?.sellerPosition || '',
    urgency: body?.urgency || 'moderate',
  };
  if (!p.askPrice) return new Response(JSON.stringify({ ok: false, error: '제시가 필수' }), { status: 400 });

  const userMsg = `협상 상황:
- 거래: ${p.dealType === 'sale' ? '매매' : p.dealType === 'jeonse' ? '전세' : '월세'}
- 제시가: ${p.askPrice.toLocaleString('ko-KR')}원
- 주변 시세: ${p.marketPrice ? p.marketPrice.toLocaleString('ko-KR') + '원' : '미입력'}
- 매물 정보: ${p.propertyInfo}
- 내 입장 (예산, 우선순위, 강점): ${p.myPosition}
- 상대 (매도자·임대인) 입장: ${p.sellerPosition}
- 내 시급성: ${p.urgency === 'urgent' ? '높음 (빨리 결정)' : p.urgency === 'flexible' ? '여유 있음' : '보통'}

협상 대본·전략을 한국 부동산 시장 맥락으로 제시하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 3000, responseMimeType: 'application/json' },
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
