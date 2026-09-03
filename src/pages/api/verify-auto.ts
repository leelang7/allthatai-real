/**
 * 자동 사기 대조 — 사용자는 받은 메시지를 붙여넣기만 한다.
 *
 * 모델 서버(SCAM_MODEL_API)의 /verify/auto 를 사이트의 게이트·쿼터 안에서 부른다.
 * 서버 쪽이 주장(사업자번호·계좌·전화·URL·기관명·금액)을 스스로 뽑아 국세청·공정위·금융위에
 * 동시에 대조하고, 각본 단계·정부 경보까지 한 번에 돌려준다. 입력은 어디에도 저장하지 않는다.
 *
 * 관례는 verify-text.ts 와 같다: gateOrQuota → incrEvent → modelHeaders() → consumeQuota.
 * SCAM_MODEL_API 가 비어 있으면 503 — 이 기능은 Gemini 폴백이 없다(사실 대조는 LLM이 대신 못 한다).
 */
import type { APIRoute } from 'astro';
import { incrEvent } from '../../lib/stat-counter';
import { modelHeaders } from '../../lib/access-gate';
import { gateOrQuota, consumeQuota, FREE_LIMIT } from '../../lib/quota-gate';

const MAX_MESSAGES = 200;
const MAX_CHARS = 30000;

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Privacy-Policy': 'no-input-storage', ...extra },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const g = await gateOrQuota(request, body);
  if (!g.ok) return g.response!;

  // messages 배열 또는 input 문자열(줄바꿈 분리) 둘 다 받는다 — 알림 리스너·공유 시트는 한 덩어리로 온다
  let messages: string[] = Array.isArray(body?.messages) ? body.messages : String(body?.input || '').split('\n');
  messages = messages.map((m) => String(m ?? '').trim()).filter(Boolean).slice(0, MAX_MESSAGES);
  const total = messages.reduce((n, m) => n + m.length, 0);
  if (!messages.length || total < 5) return json({ ok: false, error: '입력 5자 이상' }, 400);
  if (total > MAX_CHARS) return json({ ok: false, error: '입력 30,000자 초과' }, 400);

  const modelApi = (import.meta.env as any).SCAM_MODEL_API || process.env.SCAM_MODEL_API;
  if (!modelApi) return json({ ok: false, error: '대조 서버 미연결 (SCAM_MODEL_API)' }, 503);

  incrEvent('verify_auto');

  let res: Response;
  try {
    res = await fetch(`${modelApi}/verify/auto`, {
      method: 'POST',
      headers: modelHeaders(),
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e: any) {
    return json({ ok: false, error: '대조 서버 응답 없음', detail: String(e?.message || e).slice(0, 120) }, 502);
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return json({ ok: false, error: `대조 서버 ${res.status}`, detail }, 502);
  }
  const data = await res.json();

  let freeTier: any = undefined;
  if (g.useFree) {
    const used = await consumeQuota(request);
    freeTier = { used, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - used) };
  }

  return json({ ok: true, source: 'self-model:auto', ...data, privacy: 'no_input_storage', freeTier });
};
