/**
 * /api/holiday — 한국천문연구원 특일 정보 (공휴일 + 24절기).
 *
 * 입력 (GET): ?year=2026 [&month=5] [&type=holi|24div|anni|sun]
 *   - holi: 공휴일 (기본)
 *   - 24div: 24절기
 *   - anni: 기념일
 *   - sun: 일·월요일
 *
 * 환경변수 DATA_GO_KR_KEY 필요.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const ENDPOINTS = {
  holi: 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo',
  '24div': 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/get24DivisionsInfo',
  anni: 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getAnniversaryInfo',
  sun: 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getSundryDayInfo',
};

function extractItems(xml: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const obj: Record<string, string> = {};
    const fieldRe = /<([a-zA-Z]+)>([\s\S]*?)<\/\1>/g;
    let f: RegExpExecArray | null;
    while ((f = fieldRe.exec(m[1])) !== null) {
      obj[f[1]] = f[2].trim();
    }
    out.push(obj);
  }
  return out;
}

export const GET: APIRoute = async ({ url }) => {
  const apiKey = (import.meta.env as any).DATA_GO_KR_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'DATA_GO_KR_KEY 미설정' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const year = url.searchParams.get('year') || String(new Date().getFullYear());
  const month = url.searchParams.get('month');
  const type = (url.searchParams.get('type') || 'holi') as keyof typeof ENDPOINTS;
  const endpoint = ENDPOINTS[type];
  if (!endpoint) {
    return new Response(JSON.stringify({ ok: false, error: 'type은 holi|24div|anni|sun' }), { status: 400 });
  }

  if (!/^\d{4}$/.test(year)) {
    return new Response(JSON.stringify({ ok: false, error: 'year 4자리 필요' }), { status: 400 });
  }

  let qs = `serviceKey=${encodeURIComponent(apiKey)}&solYear=${year}&numOfRows=100`;
  if (month) qs += `&solMonth=${String(month).padStart(2, '0')}`;

  try {
    const res = await fetch(`${endpoint}?${qs}`);
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: `API ${res.status}` }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }
    const xml = await res.text();
    const items = extractItems(xml).map((r) => ({
      date: r.locdate || '',
      name: r.dateName || '',
      isHoliday: r.isHoliday === 'Y',
      seq: parseInt(r.seq || '0', 10),
    }));

    return new Response(JSON.stringify({
      ok: true, year, type, count: items.length, items,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false, error: e instanceof Error ? e.message : 'fetch failed',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
