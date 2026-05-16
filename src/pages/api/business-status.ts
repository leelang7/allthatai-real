/**
 * /api/business-status — 국세청 사업자등록 진위·상태 조회.
 *
 * 입력: POST { bizNo: "1234567890" }
 * 출력: { ok, status, taxType, name, message }
 *
 * 외부 API: 국세청_사업자등록정보 진위확인 및 상태조회 (data.go.kr 1576934)
 * 환경변수 DATA_GO_KR_KEY 필요.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).DATA_GO_KR_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'DATA_GO_KR_KEY 미설정' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 });
  }

  const bizNo = (body?.bizNo || '').replace(/[-\s]/g, '');
  if (!/^\d{10}$/.test(bizNo)) {
    return new Response(JSON.stringify({ ok: false, error: '사업자번호 10자리 숫자가 아님' }), { status: 400 });
  }

  try {
    const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ b_no: [bizNo] }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ ok: false, error: `상태조회 API ${res.status}`, detail: text.slice(0, 300) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json() as any;
    const item = data?.data?.[0];
    if (!item || item.b_stt_cd === '') {
      return new Response(JSON.stringify({
        ok: false,
        error: '등록되지 않은 사업자',
        status: '미등록',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const statusMap: Record<string, string> = {
      '01': '계속사업자',
      '02': '휴업자',
      '03': '폐업자',
    };
    const taxTypeMap: Record<string, string> = {
      '01': '부가가치세 일반과세자',
      '02': '부가가치세 간이과세자',
      '03': '부가가치세 면세사업자',
      '04': '비영리법인 등',
      '05': '국가/지자체',
    };

    return new Response(JSON.stringify({
      ok: true,
      bizNo,
      statusCode: item.b_stt_cd,
      status: statusMap[item.b_stt_cd] || item.b_stt,
      taxTypeCode: item.tax_type_cd,
      taxType: taxTypeMap[item.tax_type_cd] || item.tax_type,
      endDate: item.end_dt || null,  // 폐업일 (있다면)
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : 'fetch failed',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
