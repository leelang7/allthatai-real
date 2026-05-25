/**
 * /api/ai-contract-check — 임대차 계약서 함정 조항 LLM 탐지.
 *
 * 입력: POST { text: "계약서 텍스트", type: "jeonse"|"monthly"|"sale" }
 * 출력: { ok, fairnessScore (0-100), redClauses[], missingClauses[], suggestions[] }
 */
import type { APIRoute } from 'astro';
import { incrEvent } from '../../lib/stat-counter';

export const prerender = false;

const SYSTEM = `당신은 한국 부동산 임대차·매매 계약서를 검토하는 변호사입니다.
사용자가 제시한 계약서 텍스트에서 임차인·매수인에게 불리한 조항(함정 조항)을 식별합니다.

체크 항목:
1. 원상복구 범위 과도 (자연마모까지 임차인 부담)
2. 보증금 반환 시점 불명확 또는 임대인 일방적
3. 중도해지 위약금 과도 (월세 3개월 이상)
4. 임대인 수선의무 면제 조항
5. 임대인 출입권 무제한
6. 분쟁 시 임대인 소재지 관할 합의
7. 특약사항 중 일방적으로 임차인 불리한 내용
8. 묵시적 갱신 배제 조항
9. 계약 갱신 거절 권리 박탈
10. 전세권/임차권 등기 금지 조항
11. 누락된 필수 조항 (관리비, 계약 만료일, 보증금 반환 조건)

응답은 JSON ONLY (markdown 금지):
{
  "fairnessScore": 0-100 정수 (100=공정, 0=매우 불공정),
  "verdict": "공정" | "보통" | "주의" | "불공정",
  "summary": "한 줄 요약",
  "redClauses": [{"clause": "원문 발췌 (30자 이내)", "issue": "왜 위험한지", "severity": "높음"|"중간"|"낮음"}],
  "missingClauses": ["누락된 필수 조항 1", ...],
  "suggestions": ["수정·삭제·추가 권장 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  incrEvent("ai_contract");

  const text = (body?.text || '').toString().trim();
  const type = body?.type || 'jeonse';
  if (text.length < 100) {
    return new Response(JSON.stringify({ ok: false, error: '계약서 텍스트 최소 100자 이상 필요' }), { status: 400 });
  }
  if (text.length > 30000) {
    return new Response(JSON.stringify({ ok: false, error: '텍스트 30,000자 초과' }), { status: 400 });
  }

  const typeLabel = type === 'jeonse' ? '전세' : type === 'monthly' ? '월세' : '매매';

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `[${typeLabel} 계약서]\n\n${text}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: 'application/json' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}`, detail: errText.slice(0, 300) }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); }
    catch {
      const cleaned = reply.replace(/```json|```/g, '').trim();
      try { parsed = JSON.parse(cleaned); }
      catch {
        return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패', raw: reply.slice(0, 300) }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, ...parsed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
