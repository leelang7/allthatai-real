/**
 * 집단 확인 — "이 메시지, 사기였나요?" [사기였어요] [아니었어요]
 *
 * 자동 대조 응답의 crowd[].hash 를 받아 해당 주장(계좌·전화·URL·사업자번호)의 확인 카운트를 올린다.
 * 원문은 오지도 않고 저장되지도 않는다. 같은 IP·같은 해시는 하루 한 번만 센다.
 */
import type { APIRoute } from 'astro';
import { feedback } from '../../lib/crowd';
import { clientIp } from '../../lib/quota-gate';
import { incrEvent } from '../../lib/stat-counter';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const verdict = body?.verdict === 'scam' ? 'scam' : body?.verdict === 'safe' ? 'safe' : null;
  const hashes: string[] = Array.isArray(body?.hashes) ? body.hashes.map(String) : [];
  if (!verdict || !hashes.length) {
    return new Response(JSON.stringify({ ok: false, error: 'verdict(scam|safe)와 hashes 가 필요합니다' }), { status: 400 });
  }

  const r = await feedback(hashes, verdict, clientIp(request));
  incrEvent(`verify_feedback:${verdict}`);
  return new Response(JSON.stringify({ ok: true, ...r }), {
    headers: { 'Content-Type': 'application/json', 'X-Privacy-Policy': 'hash-only' },
  });
};
