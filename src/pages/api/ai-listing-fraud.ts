/**
 * /api/ai-listing-fraud — AI 매물 사기 패턴 탐지.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 부동산 사기 탐지 전문가입니다. 매물 정보 + 시세를 비교해 사기 가능성을 판단합니다.

탐지 패턴:
- 시세 대비 비정상 저렴 (-15% 이하)
- "급매" "오늘만" 압박 문구
- 등기부 공개 거부 / 직거래 강요
- 보증금 송금 계좌가 임대인 명의 아님
- 가격 협상 무한 가능
- 사진과 실제 다름 단서
- 깡통전세 (전세가율 80%+)
- 신탁 등기인데 신탁사 동의서 없음
- 다가구주택에서 선순위 보증금 미공개

응답 JSON ONLY:
{
  "fraudScore": 0-100,
  "verdict": "안전"|"의심"|"위험"|"매우위험",
  "summary": "한 줄 요약",
  "detectedPatterns": [{"pattern":"패턴","severity":"높음|중간|낮음","explanation":"설명"}],
  "checkList": ["확인할 항목 1", ...],
  "redFlags": ["즉시 의심해야 할 신호 1", ...],
  "nextSteps": ["다음 행동 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const listingText = (body?.listingText || '').toString().trim();
  const marketPrice = +body?.marketPrice || 0;
  const askPrice = +body?.askPrice || 0;
  const dealType = body?.dealType || 'jeonse';
  if (listingText.length < 20) return new Response(JSON.stringify({ ok: false, error: '매물 설명 최소 20자' }), { status: 400 });

  const priceDiff = marketPrice > 0 ? ((askPrice - marketPrice) / marketPrice * 100).toFixed(1) : 'N/A';
  const userMsg = `매물 정보:
- 거래 유형: ${dealType === 'sale' ? '매매' : dealType === 'monthly' ? '월세' : '전세'}
- 제시가: ${askPrice.toLocaleString('ko-KR')}원
- 시세: ${marketPrice ? marketPrice.toLocaleString('ko-KR') + '원' : '미입력'}
- 시세 대비: ${priceDiff}%

[매물 설명/특이사항]
${listingText}

위 매물의 사기 가능성을 판단하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: 'application/json' },
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
