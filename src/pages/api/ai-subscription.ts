/**
 * /api/ai-subscription — AI 청약 자격·전략 진단.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 주택청약 전문가입니다. 사용자 정보로 자격·전략·우선 단지를 추천합니다.

응답 JSON ONLY:
{
  "currentScore": 0-84,
  "scoreBreakdown": {"무주택": 0-32, "부양가족": 0-35, "통장": 0-17},
  "tier": "강남급"|"서울일반"|"수도권"|"지방"|"부족",
  "qualifies": ["1순위 일반", "신혼특공", "생애최초" 등 자격 있는 유형 배열],
  "strategies": [{
    "title": "전략 제목",
    "target": "추천 단지 유형 (예: 신혼특공)",
    "reasoning": "왜 이 전략",
    "scoreImprovement": "추가 점수 (예: +5점/년)",
    "timeframe": "기간 (예: 6개월)"
  }],
  "missedOpportunities": ["놓치고 있는 특별공급 1", ...],
  "actionItems": ["오늘 할 일 1", ...],
  "warnings": ["주의사항 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const p = {
    age: +body?.age || 0,
    married: !!body?.married,
    marriedYears: +body?.marriedYears || 0,
    children: +body?.children || 0,
    parents: +body?.parents || 0,
    noHouseYears: +body?.noHouseYears || 0,
    bankYears: +body?.bankYears || 0,
    bankBalance: +body?.bankBalance || 0,
    region: body?.region || '서울',
    monthlyIncome: +body?.monthlyIncome || 0,
    assets: +body?.assets || 0,
    firstTimeBuyer: !!body?.firstTimeBuyer,
    target: body?.target || '아파트',
  };
  if (!p.age) return new Response(JSON.stringify({ ok: false, error: '나이 필수' }), { status: 400 });

  const userMsg = `청약 신청자 프로필:
- 만 나이: ${p.age}
- 혼인: ${p.married ? `기혼 (${p.marriedYears}년차)` : '미혼'}
- 자녀: ${p.children}명, 부모 부양: ${p.parents}명
- 무주택 기간: ${p.noHouseYears}년
- 청약통장 가입: ${p.bankYears}년 (납입 ${p.bankBalance.toLocaleString('ko-KR')}원)
- 거주 지역: ${p.region}
- 월 소득: ${p.monthlyIncome.toLocaleString('ko-KR')}원
- 자산: ${p.assets.toLocaleString('ko-KR')}원
- 생애최초: ${p.firstTimeBuyer ? '해당' : '비해당'}
- 목표: ${p.target}

2026년 청약 제도 기준으로 자격·전략·우선 단지를 진단하세요.`;

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
