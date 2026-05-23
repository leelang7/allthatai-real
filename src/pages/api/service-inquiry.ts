/**
 * /api/service-inquiry — 유료 서비스 신청 폼 처리.
 *
 * 입력: POST { service, name, contact, email, details }
 * 처리:
 *   1. 신청 ID 생성 (timestamp + random)
 *   2. 입금 안내 (계좌 + 입금자명 = 신청 ID)
 *   3. 이메일·Slack·텔레그램 알림 (env 설정 시)
 *
 * 환경변수 (선택):
 *   RESEND_API_KEY — 이메일 자동 발송
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID — 운영자 알림
 *   SERVICE_BANK_ACCOUNT — 입금 계좌 (없으면 placeholder)
 */
import type { APIRoute } from 'astro';
import { findService } from '../../data/services';

export const prerender = false;

function genInquiryId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ATA${ts}${rnd}`.slice(0, 16);
}

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const slug = (body?.service || '').toString();
  const svc = findService(slug);
  if (!svc) return new Response(JSON.stringify({ ok: false, error: '존재하지 않는 서비스' }), { status: 400 });

  const name = (body?.name || '').toString().trim();
  const contact = (body?.contact || '').toString().trim();
  const email = (body?.email || '').toString().trim();
  const details = (body?.details || '').toString().trim();

  if (!name || !contact || !email) {
    return new Response(JSON.stringify({ ok: false, error: '이름·연락처·이메일 모두 필수' }), { status: 400 });
  }
  if (!email.includes('@')) {
    return new Response(JSON.stringify({ ok: false, error: '이메일 형식 오류' }), { status: 400 });
  }

  const inquiryId = genInquiryId();
  const bankAccount = (import.meta.env as any).SERVICE_BANK_ACCOUNT || process.env.SERVICE_BANK_ACCOUNT || '카카오뱅크 3333-XX-XXXXXXX 이상철';
  const submittedAt = new Date().toISOString();

  // 운영자 알림 (Telegram bot 사용 시)
  const tgToken = (import.meta.env as any).TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = (import.meta.env as any).TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChat) {
    const msg = `🆕 새 서비스 신청\n\n` +
      `ID: ${inquiryId}\n` +
      `서비스: ${svc.title}\n` +
      `단가: ${svc.priceLabel}\n` +
      `이름: ${name}\n` +
      `연락: ${contact}\n` +
      `이메일: ${email}\n\n` +
      `${details ? '상세:\n' + details : ''}`;
    try {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text: msg }),
      });
    } catch { /* fail silently */ }
  }

  // 신청자에게 입금 안내 이메일 (Resend 사용 시)
  const resendKey = (import.meta.env as any).RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (resendKey) {
    const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222">
  <h2 style="color:#0891b2">${svc.title} 신청 접수</h2>
  <p><strong>신청 ID:</strong> <code style="background:#f4f4f5;padding:2px 8px;border-radius:4px">${inquiryId}</code></p>
  <p>입금 후 영업일 기준 처리 시작합니다 (소요: ${svc.deliveryTime})</p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e4e4e7"/>
  <h3>💳 입금 안내</h3>
  <ul>
    <li><strong>금액:</strong> ${svc.priceLabel}</li>
    <li><strong>계좌:</strong> ${bankAccount}</li>
    <li><strong>입금자명:</strong> <code style="background:#fef3c7;padding:2px 8px;border-radius:4px">${inquiryId}</code> (반드시 이대로)</li>
  </ul>
  <p style="color:#71717a;font-size:13px">입금자명을 신청 ID로 적어야 자동 매칭됩니다.</p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e4e4e7"/>
  <h3>📋 다음 단계</h3>
  <ol>
    <li>위 계좌로 입금</li>
    <li>입금 확인 (1-3시간) → 카카오톡/이메일로 자료 요청</li>
    <li>분석 진행 (${svc.deliveryTime})</li>
    <li>결과 보고서 이메일 전송</li>
  </ol>
  <p style="color:#71717a;font-size:12px;margin-top:32px">문의: 이 메일에 답장 또는 카카오톡 채널</p>
</div>`;
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'AllThatAI Real <orders@allthatai-real.vercel.app>',
          to: [email],
          subject: `[${inquiryId}] ${svc.title} — 입금 안내`,
          html,
        }),
      });
    } catch { /* fail silently */ }
  }

  return new Response(JSON.stringify({
    ok: true,
    inquiryId,
    service: svc.title,
    price: svc.priceLabel,
    bankAccount,
    deliveryTime: svc.deliveryTime,
    instructions: [
      `${bankAccount}으로 ${svc.priceLabel} 입금`,
      `입금자명을 "${inquiryId}" 으로 (자동 매칭)`,
      '입금 확인 후 1-3시간 내 카카오톡/이메일로 자료 요청',
      `처리 완료까지 ${svc.deliveryTime}`,
    ],
    submittedAt,
  }), { headers: { 'Content-Type': 'application/json' } });
};
