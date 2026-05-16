/**
 * /api/building-info — 건축물대장 표제부 (위반건축물, 용도, 구조).
 *
 * 외부 API: 국토교통부_건축HUB_건축물대장정보 (data.go.kr 15044713)
 * Endpoint: getBrTitleInfo (표제부)
 *
 * 입력 (GET): ?sigunguCd=11680&bjdongCd=10300&bun=0001&ji=0000&platGbCd=0
 *   - sigunguCd: 시군구코드 5자리
 *   - bjdongCd: 법정동코드 5자리
 *   - bun: 본번 (4자리, 앞 0 padding)
 *   - ji: 부번 (4자리)
 *   - platGbCd: 0=대지, 1=산, 2=블록
 *
 * 출력: 위반여부, 주용도, 연면적, 층수, 사용승인일 등
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const ENDPOINT = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo';

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

  const sigunguCd = url.searchParams.get('sigunguCd') || '';
  const bjdongCd = url.searchParams.get('bjdongCd') || '';
  const bun = (url.searchParams.get('bun') || '').padStart(4, '0');
  const ji = (url.searchParams.get('ji') || '0000').padStart(4, '0');
  const platGbCd = url.searchParams.get('platGbCd') || '0';

  if (!/^\d{5}$/.test(sigunguCd) || !/^\d{5}$/.test(bjdongCd) || !/^\d{4}$/.test(bun)) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'sigunguCd(5) + bjdongCd(5) + bun(4) 필요',
      example: '?sigunguCd=11680&bjdongCd=10300&bun=0001',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const qs = `serviceKey=${encodeURIComponent(apiKey)}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&platGbCd=${platGbCd}&bun=${bun}&ji=${ji}&numOfRows=10`;

  try {
    const res = await fetch(`${ENDPOINT}?${qs}`);
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: `API ${res.status}` }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }
    const xml = await res.text();
    const raw = extractItems(xml);

    if (raw.length === 0) {
      return new Response(JSON.stringify({
        ok: true, count: 0, items: [], note: '해당 주소 건축물대장 없음 — 미등록 또는 입력 오류',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const items = raw.map((r) => ({
      // 위반여부 (Y/N) — 가장 중요
      violation: r.violMatter === 'Y' || r.violMatter === 'Y_VIOL',
      violationReason: r.violMatter || '',
      // 건물명
      bldNm: r.bldNm || '',
      // 주소
      newPlatPlc: r.newPlatPlc || '',
      platPlc: r.platPlc || '',
      // 주용도
      mainPurpsCd: r.mainPurpsCd || '',
      mainPurpsCdNm: r.mainPurpsCdNm || '',
      // 면적
      totArea: parseFloat(r.totArea || '0'),
      platArea: parseFloat(r.platArea || '0'),
      // 층수
      grndFlrCnt: parseInt(r.grndFlrCnt || '0', 10),
      ugrndFlrCnt: parseInt(r.ugrndFlrCnt || '0', 10),
      // 사용승인일
      useAprDay: r.useAprDay || '',
      // 구조
      strctCd: r.strctCd || '',
      strctCdNm: r.strctCdNm || '',
    }));

    return new Response(JSON.stringify({
      ok: true,
      count: items.length,
      items,
      hasViolation: items.some((i) => i.violation),
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false, error: e instanceof Error ? e.message : 'fetch failed',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
