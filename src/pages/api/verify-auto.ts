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
import { observeAndLookup } from '../../lib/crowd';
import { extract, publicInstitutionCheck, unsourcedChecks } from '../../lib/claims';
import { runRegistryChecks } from '../../lib/registry';

/** 모델 서버 생사 기록 — 관리자 통계가 "홈 PC가 죽었는지"를 볼 수 있게. 값은 ISO 시각. */
function markModelServer(ok: boolean): void {
  const e = (import.meta.env as any);
  const url = e.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || e.KV_REST_API_URL || process.env.KV_REST_API_URL;
  const token = e.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || e.KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  const k = ok ? 'stat:model_server:last_ok' : 'stat:model_server:last_fail';
  fetch(`${url}/set/${encodeURIComponent(k)}/${encodeURIComponent(new Date().toISOString())}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

/**
 * 축소 모드 — 모델 서버(홈 PC)가 죽었을 때. 모델이 필요 없는 것만 한다:
 * 주장 추출 · 공공기관 사칭 즉시 반증 · 국세청/공정위/금융위 대조 · 집단 관측.
 * 문체 분류기·각본 단계·경보 RAG 는 빠진다. 사용자에게 그 사실을 그대로 보여준다.
 */
async function degraded(messages: string[], reason: string) {
  const t0 = Date.now();
  const joined = messages.join(' ');
  const claims = extract(joined);
  const tNet = Date.now();
  const checks = [...publicInstitutionCheck(claims), ...(await runRegistryChecks(claims)), ...unsourcedChecks(claims)];
  const netMs = Date.now() - tNet;
  const statuses = checks.map((c) => c.status);
  const refuted = statuses.includes('반증');
  let overall: string, why: string;
  if (refuted) { overall = '반증'; why = '주장과 공적 기록이 어긋난다'; }
  else if (checks.length && statuses.every((x) => x === '부합')) { overall = '부합'; why = '확인 가능한 주장은 전부 기록과 일치한다'; }
  else { overall = '미확인'; why = '대조할 주장이 없거나 조회 불가'; }
  return {
    overall, why, tier: refuted ? 'alarm' : 'none',
    claims, checks,
    stage: 0, stage_name: '판정 생략', description: '모델 서버 미연결 — 각본 단계·문체 점수·정부 경보 대조는 이번에 수행되지 않았습니다',
    next_warning: '', evidence: [], amounts_krw: claims.amount_krw, messages_seen: messages.length,
    messages: messages.map((_, i) => ({ index: i, risk_score: null, verdict: null })),
    advisories: [],
    timing_ms: { total: Date.now() - t0, network_checks_parallel: netMs, stage_rules: 0, classifier: 0, advisory_rag: 0 },
    degraded: true, degraded_reason: reason,
  };
}

// output:'static' 프로젝트라 선언이 없으면 정적 파일로 프리렌더되어 POST가 405가 된다(다른 API 라우트와 동일)
export const prerender = false;

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
  incrEvent('verify_auto');

  // 모델 서버(홈 PC) 우선. 안 되면 503/502 로 끝내지 않고 축소 모드로 내려간다 —
  // 심사·시연 중에 집 PC 하나 때문에 페이지가 통째로 죽는 일이 없어야 한다.
  let data: any = null;
  let source = 'self-model:auto';
  if (!modelApi) {
    data = await degraded(messages, 'SCAM_MODEL_API 미설정');
    source = 'site-fallback';
  } else {
    try {
      const res = await fetch(`${modelApi}/verify/auto`, {
        method: 'POST', headers: modelHeaders(), body: JSON.stringify({ messages }), signal: AbortSignal.timeout(12000),
      });
      if (res.ok) { data = await res.json(); markModelServer(true); }
      else { markModelServer(false); data = await degraded(messages, `모델 서버 ${res.status}`); source = 'site-fallback'; incrEvent('verify_auto_degraded'); }
    } catch (e: any) {
      markModelServer(false);
      data = await degraded(messages, `모델 서버 응답 없음 (${String(e?.name || e).slice(0, 40)})`);
      source = 'site-fallback';
      incrEvent('verify_auto_degraded');
    }
  }

  // 집단 관측 — 이번 검사에서 나온 계좌·전화·URL·사업자번호를 해시로 세고, 다른 사람들에게도 왔는지 본다.
  // 실패해도 판정은 그대로 나간다(관측은 보강이지 조건이 아니다).
  let crowd: any[] = [];
  try { crowd = await observeAndLookup(data?.claims || {}); } catch { crowd = []; }

  let freeTier: any = undefined;
  if (g.useFree) {
    const used = await consumeQuota(request);
    freeTier = { used, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - used) };
  }

  return json({ ok: true, source, ...data, crowd, privacy: 'no_input_storage', freeTier });
};
