/**
 * /api/realestate-apt — 아파트 매매 + 전월세 실거래가 (국토교통부).
 *
 * 입력 (GET): ?lawdCd=11680&yyyymm=202604&type=sale|rent
 * 출력: { ok, type, count, items: [{dealDate, name, dong, areaM2, priceKrw, ...}], avgPrice }
 *
 * 외부 API:
 *   매매: getRTMSDataSvcAptTradeDev (data.go.kr 15126474)
 *   전월세: getRTMSDataSvcAptRent (data.go.kr 15126469)
 *
 * XML 응답 → 정규식으로 항목 추출.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SALE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
const RENT_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';

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
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const lawdCd = url.searchParams.get('lawdCd') || '';     // 법정동 코드 5자리
  const yyyymm = url.searchParams.get('yyyymm') || '';     // 거래 연월
  const type = (url.searchParams.get('type') || 'sale') as 'sale' | 'rent';

  if (!/^\d{5}$/.test(lawdCd) || !/^\d{6}$/.test(yyyymm)) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'lawdCd (5자리 법정동) + yyyymm (6자리 YYYYMM) 필요',
      example: '?lawdCd=11680&yyyymm=202604&type=sale (서울 강남구)',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const baseUrl = type === 'rent' ? RENT_URL : SALE_URL;
  const fullUrl = `${baseUrl}?serviceKey=${encodeURIComponent(apiKey)}&LAWD_CD=${lawdCd}&DEAL_YMD=${yyyymm}&pageNo=1&numOfRows=1000`;

  try {
    const res = await fetch(fullUrl);
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({
        ok: false,
        error: `API ${res.status}`,
        detail: text.slice(0, 300),
      }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    const xml = await res.text();
    const raw = extractItems(xml);

    if (raw.length === 0 || xml.includes('<resultCode>03</resultCode>')) {
      return new Response(JSON.stringify({
        ok: true,
        type,
        lawdCd,
        yyyymm,
        count: 0,
        items: [],
        avgPrice: null,
        note: '해당 월 데이터 없음',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Normalize
    const items = raw.map((r) => {
      const dealDate = `${r.dealYear || ''}-${(r.dealMonth || '').padStart(2, '0')}-${(r.dealDay || '').padStart(2, '0')}`;
      const areaM2 = parseFloat(r.excluUseAr || r.excluUseAR || '0');
      let priceKrw = 0;
      if (type === 'sale') {
        priceKrw = parseInt((r.dealAmount || '0').replace(/[,\s]/g, ''), 10) * 10000;
      } else {
        priceKrw = parseInt((r.deposit || '0').replace(/[,\s]/g, ''), 10) * 10000;
      }
      const monthly = type === 'rent'
        ? parseInt((r.monthlyRent || '0').replace(/[,\s]/g, ''), 10) * 10000
        : 0;
      return {
        dealDate,
        name: r.aptNm || r.aptName || '',
        dong: r.umdNm || r.dongName || '',
        jibun: r.jibun || '',
        floor: parseInt(r.floor || '0', 10),
        areaM2,
        areaPyung: Math.round(areaM2 / 3.305785 * 10) / 10,
        priceKrw,
        monthly,
      };
    });

    // Average + median price
    const prices = items.map((i) => i.priceKrw).filter((p) => p > 0);
    const avgPrice = prices.length > 0
      ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
      : null;
    const sorted = [...prices].sort((a, b) => a - b);
    const medianPrice = sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)]
      : null;

    return new Response(JSON.stringify({
      ok: true,
      type,
      lawdCd,
      yyyymm,
      count: items.length,
      items: items.slice(0, 50),  // 상위 50건만
      avgPrice,
      medianPrice,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : 'fetch failed',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
