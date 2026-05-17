/**
 * /api/ai-etungi — Gemini로 등기부등본 텍스트 분석.
 *
 * 입력: POST { text: "등기부등본 텍스트 전체" }
 * 출력: { ok, riskScore (0-100), riskLevel, summary, redFlags[], recommendations[] }
 *
 * 환경변수 GEMINI_API_KEY 필요.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 부동산 등기부등본을 분석하는 전문가입니다.
사용자가 붙여넣은 등기부등본 텍스트(또는 그 일부)를 분석해서 전세·매매 계약 시 위험을 판단합니다.

분석할 핵심 항목:
1. 갑구(소유권) — 소유자, 압류, 가압류, 가처분, 가등기, 신탁
2. 을구(소유권 외) — 근저당권 채권최고액, 전세권, 임차권 등기
3. 권리 변동 이력 — 짧은 시간 잦은 명의 변경 (사기 패턴)
4. 채권최고액 vs 매물 시세 비율
5. 신탁 등기 (신탁사 동의 없으면 임차인 보호 X)
6. 임차권 등기명령 (이전 임차인 미반환 보증금)

응답은 JSON ONLY:
{
  "riskScore": 0-100 정수,
  "riskLevel": "안전" | "주의" | "위험" | "매우위험",
  "summary": "한 줄 요약 (한국어)",
  "redFlags": ["위험 요소 1", "위험 요소 2", ...],
  "recommendations": ["권장 조치 1", ...],
  "extractedInfo": {
    "owner": "소유자명 (있으면)",
    "mortgageTotal": "근저당 채권최고액 합 (원, 숫자만)",
    "hasTrust": true/false,
    "hasSeizure": true/false,
    "hasLeaseRegistration": true/false
  }
}

riskScore 가이드:
- 0-30 안전: 깨끗한 등기, 근저당 적정
- 31-50 주의: 일반적 근저당 있음
- 51-75 위험: 근저당 과다, 또는 신탁
- 76-100 매우위험: 압류, 가압류, 임차권 등기, 잦은 명의변경

JSON 외 다른 텍스트 출력 금지. markdown code fence 금지.`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const text = (body?.text || '').toString().trim();
  if (text.length < 50) {
    return new Response(JSON.stringify({ ok: false, error: '등기부등본 텍스트 최소 50자 이상 필요' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (text.length > 30000) {
    return new Response(JSON.stringify({ ok: false, error: '텍스트가 너무 깁니다 (30,000자 초과)' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `등기부등본 텍스트:\n\n${text}` }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1500,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}`, detail: errText.slice(0, 500) }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!reply) {
      return new Response(JSON.stringify({ ok: false, error: 'Gemini 응답 비어있음', raw: data }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    let parsed: any;
    try { parsed = JSON.parse(reply); }
    catch {
      // markdown code fence 제거 시도
      const cleaned = reply.replace(/```json|```/g, '').trim();
      try { parsed = JSON.parse(cleaned); }
      catch {
        return new Response(JSON.stringify({ ok: false, error: 'Gemini JSON 파싱 실패', raw: reply.slice(0, 500) }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, ...parsed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false, error: e instanceof Error ? e.message : 'fetch failed',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
