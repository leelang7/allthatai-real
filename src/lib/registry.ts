/**
 * 공적 레지스트리 대조 — scam-models/crosscheck/registry.py 의 TS 이식.
 *
 * 국세청 사업자등록 상태 · 공정위 통신판매사업자 · 금융위 금융회사기본정보.
 * 반증 / 미확인 / 부합. 게이트웨이 403(활용신청 안 된 API)은 '미확인' — 대조 못 한 것과 틀린 것은 다르다.
 * 키: DATA_GO_KR_KEY (Vercel env). 홈 PC 모델 서버와 무관하게 Vercel 에서 직접 부른다.
 */
import type { Check } from './claims';

const TIMEOUT = 4000;   // 축소 모드는 빨라야 한다 — 8초면 한 API가 느릴 때 응답 전체가 8초가 됐다(실측 8002ms)
const key = () => (import.meta.env as any).DATA_GO_KR_KEY || process.env.DATA_GO_KR_KEY || '';
const brnoOf = (s: string) => String(s).replace(/\D/g, '').slice(0, 10);

async function getJson(url: string): Promise<{ status: number; data: any; note: string }> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(TIMEOUT) });
    const body = await r.text();
    try { return { status: r.status, data: JSON.parse(body), note: '' }; }
    catch {
      const m = body.match(/"errMsg"\s*:\s*"([^"]+)"|<errMsg>([^<]+)<|<returnAuthMsg>([^<]+)</);
      return { status: r.status, data: null, note: (m && (m[1] || m[2] || m[3])) || body.slice(0, 120) };
    }
  } catch (e: any) {
    return { status: 0, data: null, note: String(e?.message || e).slice(0, 120) };
  }
}

async function timed(name: string, fn: () => Promise<Check>): Promise<Check> {
  const t0 = Date.now();
  let r: Check;
  try { r = await fn(); }
  catch (e: any) { r = { check: name, status: '미확인', reason: String(e?.message || e).slice(0, 80), data: null }; }
  r.latency_ms = Date.now() - t0;
  return r;
}

const TEL = 'https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3';
export async function telecomSeller(brno: string): Promise<Check> {
  const b = brnoOf(brno);
  if (b.length !== 10) return { check: '통신판매 신고', status: '미확인', reason: '사업자번호 형식 아님', data: null };
  const { status, data, note } = await getJson(`${TEL}?serviceKey=${key()}&pageNo=1&numOfRows=5&resultType=json&brno=${b}`);
  if (!data) return { check: '통신판매 신고', status: '미확인', reason: `조회 불가 (${status} ${note})`, data: null };
  const items = data.items || [];
  if (!items.length) return { check: '통신판매 신고', status: '반증', reason: '통신판매업 신고 이력 없음 — 온라인 판매를 주장하는 업체라면 미신고', data: null };
  const it = items[0], oper = it.operSttusCdNm || '';
  const d = { 상호: it.bzmnNm, 신고번호: it.prmmiMnno, 영업상태: oper, 사업자상태: it.bzmnRgsSttusSeNm, 신고기관: it.dclrInstNm, 도메인: it.domnCn, 신고일: it.dclrDate, 대표: it.rprsvNm };
  return oper === '정상영업'
    ? { check: '통신판매 신고', status: '부합', reason: `${d.상호} · ${d.신고번호} · 정상영업`, data: d }
    : { check: '통신판매 신고', status: '반증', reason: `영업상태 '${oper}' (사업자 ${d.사업자상태})`, data: d };
}

const NTS = 'https://api.odcloud.kr/api/nts-businessman/v1/status';
export async function businessStatus(brno: string): Promise<Check> {
  const b = brnoOf(brno);
  if (b.length !== 10) return { check: '사업자등록 상태', status: '미확인', reason: '사업자번호 형식 아님', data: null };
  try {
    const r = await fetch(`${NTS}?serviceKey=${encodeURIComponent(key())}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ b_no: [b] }), signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) return { check: '사업자등록 상태', status: '미확인', reason: `조회 불가 (${r.status} ${(await r.text()).slice(0, 80)})`, data: null };
    const row = ((await r.json()).data || [{}])[0] || {};
    const d = { 상태: row.b_stt || '', 과세유형: row.tax_type, 폐업일: row.end_dt || null };
    if (row.b_stt_cd === '01') return { check: '사업자등록 상태', status: '부합', reason: '계속사업자', data: d };
    if (!row.b_stt) return { check: '사업자등록 상태', status: '반증', reason: '국세청에 등록되지 않은 사업자번호', data: d };
    return { check: '사업자등록 상태', status: '반증', reason: `${row.b_stt}${d.폐업일 ? ` (${d.폐업일})` : ''}`, data: d };
  } catch (e: any) {
    return { check: '사업자등록 상태', status: '미확인', reason: String(e?.message || e).slice(0, 80), data: null };
  }
}

const FIN = 'https://apis.data.go.kr/1160100/service/GetFnCoBasiInfoService/getFnCoOutl';
export async function financialCompany(name: string): Promise<Check> {
  const n = String(name).trim();
  if (n.length < 2) return { check: '제도권 금융회사', status: '미확인', reason: '회사명 없음', data: null };
  const { status, data, note } = await getJson(`${FIN}?serviceKey=${key()}&pageNo=1&numOfRows=5&resultType=json&fncoNm=${encodeURIComponent(n)}`);
  if (!data) return { check: '제도권 금융회사', status: '미확인', reason: `조회 불가 (${status} ${note})`, data: null };
  const items = data?.response?.body?.items;
  const rows: any[] = Array.isArray(items) ? items : (items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : []);
  if (!rows.length) return { check: '제도권 금융회사', status: '반증', reason: `'${n}' 이름의 제도권 금융회사 없음`, data: null };
  const it = rows[0];
  return { check: '제도권 금융회사', status: '부합', reason: `${it.fncoNm} 실재`, data: { 회사명: it.fncoNm, 사업자번호: it.bzno, 설립일: it.fncoEstbDt, 주소: it.fncoAddr } };
}

/** 주장별 대조를 전부 동시에. */
export async function runRegistryChecks(claims: { brno: string[]; financial_company: string[] }): Promise<Check[]> {
  if (!key()) return [];
  const jobs: Promise<Check>[] = [];
  for (const b of claims.brno.slice(0, 3)) {
    jobs.push(timed('사업자등록 상태', () => businessStatus(b)));
    jobs.push(timed('통신판매 신고', () => telecomSeller(b)));
  }
  for (const n of claims.financial_company.slice(0, 3)) jobs.push(timed('제도권 금융회사', () => financialCompany(n)));
  return Promise.all(jobs);
}
