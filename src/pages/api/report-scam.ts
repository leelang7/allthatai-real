/**
 * /api/report-scam — 사용자 사기 사례 제보 (학습 데이터 수집).
 *
 * 입력: POST { category, text, source, outcome, contact? }
 * 처리:
 *   1. Telegram 알림 (운영자)
 *   2. 향후 KV/D1에 저장 → 자체 모델 재학습 데이터로 활용
 *
 * 제보자 보상: 채택 시 ₩5K 카카오페이 (수동 처리)
 */
import type { APIRoute } from 'astro';

export const prerender = false;

interface Report {
  category: string;
  text: string;
  source?: string;
  outcome?: '의심 단계' | '돈 잃음' | '신고 완료' | '예방 성공' | '기타';
  contact?: string;
  ts: string;
  id: string;
}

const ALLOWED_CATEGORIES = [
  'phishing-text', 'romance-scam', 'fake-review', 'ai-text-detection',
  'deepfake-image', 'deepvoice', 'document-forgery', 'etungi-forgery',
  'health-gym-terms', 'insurance-terms', 'telecom-terms', 'subscription-terms',
  'business-forgery', 'other',
];

function genId() {
  return 'RPT' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const category = (body?.category || '').toString();
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return new Response(JSON.stringify({ ok: false, error: 'unknown category' }), { status: 400 });
  }
  const text = (body?.text || '').toString().trim();
  if (text.length < 20) return new Response(JSON.stringify({ ok: false, error: '내용 20자 이상' }), { status: 400 });
  if (text.length > 10000) return new Response(JSON.stringify({ ok: false, error: '내용 10,000자 초과' }), { status: 400 });

  const report: Report = {
    category,
    text,
    source: (body?.source || '').toString().slice(0, 200),
    outcome: body?.outcome || '의심 단계',
    contact: (body?.contact || '').toString().slice(0, 200),
    ts: new Date().toISOString(),
    id: genId(),
  };

  // Telegram 알림 (env 등록 시)
  const tgToken = (import.meta.env as any).TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = (import.meta.env as any).TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChat) {
    const msg = `🚨 새 사기 제보\n\nID: ${report.id}\n분류: ${category}\n결과: ${report.outcome}\n출처: ${report.source || '-'}\n연락: ${report.contact || '-'}\n\n${text.slice(0, 1500)}`;
    try {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text: msg }),
      });
    } catch { /* silent */ }
  }

  return new Response(JSON.stringify({
    ok: true,
    id: report.id,
    message: '제보 접수됨. 채택 시 카카오페이 ₩5,000 보상 (수동 검토 후).',
    note: '자체 한국어 모델 학습 데이터로 익명 활용.',
  }), { headers: { 'Content-Type': 'application/json' } });
};
