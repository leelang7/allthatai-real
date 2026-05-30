/**
 * /api/ai-hidden-money — AI 숨은 돈 진단.
 *
 * 사용자 프로필 → 가능 발견 금액 + 우선순위 + 즉시 조회 사이트.
 */
import type { APIRoute } from 'astro';
import { incrEvent } from '../../lib/stat-counter';

export const prerender = false;

const SYSTEM = `당신은 한국 미환급금·휴면계좌 추적 전문가입니다. 사용자 프로필 → 우선순위 + 예상 금액.

체크하는 카테고리:
- 휴면예금 (payinfo)
- 휴면보험 (내보험찾아줌)
- 국세 미환급 (홈택스)
- 지방세 미환급 (위택스)
- 통신비 미환급 (스마트초이스)
- 국민연금 일시금
- 퇴직연금 (통합연금포털)
- 카드 포인트 (여신금융협회)
- 항공 마일리지
- 제휴 포인트 (OK캐쉬백 등)
- 한전 캐시백
- 미수령 주식·배당
- 복지 미수령 (정부24)

응답 JSON ONLY:
{
  "totalEstimate": "예상 총 발견 금액 (원)",
  "confidence": "낮음|보통|높음",
  "priority": [{
    "category": "카테고리",
    "estimatedAmount": "예상 금액 (원)",
    "probability": "발견 확률 0-100",
    "officialUrl": "공식 사이트",
    "officialName": "기관명",
    "timeToFind": "소요 시간",
    "whyYou": "왜 당신에게 가능성 있는지",
    "actionSteps": ["1단계", "2단계", ...]
  }],
  "quickWins": ["5분 안에 확인 가능한 것 1", ...],
  "longTermActions": ["시간 들여서 할 것 1", ...],
  "warnings": ["함정·시효 주의 1", ...],
  "estimatedTotalTime": "전체 조회 소요 시간"
}

우선순위 = (예상 금액 × 발견 확률) / 소요 시간`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  incrEvent("hidden_money_diagnose");

  const p = {
    age: +body?.age || 0,
    jobHistory: body?.jobHistory || '',
    bankAccounts: body?.bankAccounts || '',
    insurance: body?.insurance || '',
    realEstate: body?.realEstate || '',
    cars: body?.cars || '',
    telecomChanges: body?.telecomChanges || '',
    cards: body?.cards || '',
    inheritance: !!body?.inheritance,
    welfare: body?.welfare || '',
    extra: body?.extra || '',
  };
  if (!p.age) return new Response(JSON.stringify({ ok: false, error: '나이 필수' }), { status: 400 });

  const userMsg = `숨은 돈 진단 프로필:
- 나이: ${p.age}세
- 직장 이력 (이직·퇴직): ${p.jobHistory || '미입력'}
- 보유 은행 계좌 (활성/비활성): ${p.bankAccounts || '미입력'}
- 가입한 보험: ${p.insurance || '미입력'}
- 부동산 거래 (5년 내): ${p.realEstate || '없음'}
- 자동차 (매매·이전): ${p.cars || '없음'}
- 통신사 변경 (3년 내): ${p.telecomChanges || '없음'}
- 카드 (개수·교체): ${p.cards || '미입력'}
- 상속·증여 받은 적: ${p.inheritance ? '예' : '아니오'}
- 복지 자격 가능성 (장애·고령·다자녀·저소득): ${p.welfare || '없음'}
- 추가 정보: ${p.extra}

위 정보로 발견 가능한 숨은 돈 우선순위 + 예상 금액 + 즉시 조회 사이트.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3500, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
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
