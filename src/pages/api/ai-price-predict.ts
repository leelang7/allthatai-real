/**
 * /api/ai-price-predict — 국토부 실거래가 + Gemini 시세 예측.
 *
 * 입력: POST { lawdCd, dong, areaM2, floor, builtYear, dealType }
 * 출력: { ok, predicted, low, high, confidence, dataPoints, reasoning, recentDeals[] }
 *
 * 환경변수 GEMINI_API_KEY, DATA_GO_KR_KEY 필요.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 아파트 실거래가 데이터를 분석하는 부동산 평가 전문가입니다.
사용자가 제공한 매물 정보와 실제 거래 데이터(최근 6개월)를 비교하여 적정 시세를 예측합니다.

분석 방법:
1. 평수가 유사한 거래만 필터링 (±15%)
2. 층수 조정 (저층 -5%, 중층 기준, 고층 +3~5%)
3. 연식 조정 (구축 -10%, 신축 +10%)
4. 동(법정동) 일치 가중치
5. 추세 분석 (최근 3개월 vs 이전 3개월)

응답은 JSON ONLY (markdown 금지):
{
  "predicted": 예측가 (원, 숫자),
  "low": 하한 (원, 신뢰구간 10% 분위),
  "high": 상한 (원, 90% 분위),
  "confidence": "높음" | "보통" | "낮음" (데이터 충분성),
  "trend": "상승" | "보합" | "하락",
  "reasoning": "예측 근거 자연어 (2-3문장, 한국어)",
  "vsAverage": "평균 대비 % (숫자, +/- 부호)"
}`;

interface DealItem {
  amount: number;
  area: number;
  floor: number;
  builtYear: number;
  dealDate: string;
  apartment: string;
}

async function fetchDeals(apiKey: string, lawdCd: string, yyyymm: string, dealType: 'sale' | 'rent'): Promise<DealItem[]> {
  const endpoint = dealType === 'sale'
    ? 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev'
    : 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
  const url = `${endpoint}?serviceKey=${encodeURIComponent(apiKey)}&LAWD_CD=${lawdCd}&DEAL_YMD=${yyyymm}&numOfRows=200&pageNo=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    return items.map((item) => {
      const get = (tag: string): string => {
        const m = item.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
        return m ? m[1].trim() : '';
      };
      const amount = dealType === 'sale'
        ? parseInt(get('dealAmount').replace(/[,\s]/g, ''), 10) * 10000
        : parseInt(get('deposit').replace(/[,\s]/g, ''), 10) * 10000;
      return {
        amount,
        area: parseFloat(get('excluUseAr')),
        floor: parseInt(get('floor'), 10),
        builtYear: parseInt(get('buildYear'), 10),
        dealDate: `${get('dealYear')}-${get('dealMonth').padStart(2, '0')}-${get('dealDay').padStart(2, '0')}`,
        apartment: get('aptNm'),
      };
    }).filter((d) => !isNaN(d.amount) && d.amount > 0 && !isNaN(d.area));
  } catch {
    return [];
  }
}

export const POST: APIRoute = async ({ request }) => {
  const geminiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const dataKey = (import.meta.env as any).DATA_GO_KR_KEY || process.env.DATA_GO_KR_KEY;
  if (!geminiKey || !dataKey) {
    return new Response(JSON.stringify({ ok: false, error: 'API 키 미설정' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const lawdCd = (body?.lawdCd || '').toString();
  const dong = (body?.dong || '').toString();
  const areaM2 = +body?.areaM2 || 0;
  const floor = +body?.floor || 0;
  const builtYear = +body?.builtYear || 0;
  const dealType = (body?.dealType === 'rent') ? 'rent' : 'sale';

  if (!/^\d{5}$/.test(lawdCd) || areaM2 <= 0) {
    return new Response(JSON.stringify({ ok: false, error: 'lawdCd(5자리) + areaM2 필요' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 최근 6개월 데이터 수집
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const allDealsArr = await Promise.all(months.map((m) => fetchDeals(dataKey, lawdCd, m, dealType)));
  let allDeals = allDealsArr.flat();
  if (allDeals.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: '해당 지역 최근 6개월 거래 없음' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 면적 ±15% 필터
  const areaLow = areaM2 * 0.85;
  const areaHigh = areaM2 * 1.15;
  const filtered = allDeals.filter((d) => d.area >= areaLow && d.area <= areaHigh);
  const finalDeals = filtered.length > 0 ? filtered : allDeals;

  // 통계 (Gemini 전 보조)
  const amounts = finalDeals.map((d) => d.amount).sort((a, b) => a - b);
  const median = amounts[Math.floor(amounts.length / 2)];
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;

  // Gemini 호출 데이터 (최대 30개)
  const sampleDeals = finalDeals.slice(0, 30).map((d) => ({
    가격: d.amount, 면적: d.area, 층: d.floor, 연식: d.builtYear, 일자: d.dealDate, 아파트: d.apartment,
  }));

  const userMsg = `매물 정보:
- 면적: ${areaM2}m²
- 층: ${floor}
- 연식: ${builtYear}년
- 거래 유형: ${dealType === 'sale' ? '매매' : '전세'}
- 동: ${dong || '미지정'}

실거래 데이터 (최근 6개월, ${finalDeals.length}건):
${JSON.stringify(sampleDeals, null, 0)}

위 데이터로 적정 시세를 예측하세요. 통계 참고:
- 평균: ${Math.round(avg).toLocaleString('ko-KR')}원
- 중간값: ${Math.round(median).toLocaleString('ko-KR')}원
- 최저~최고: ${amounts[0].toLocaleString('ko-KR')} ~ ${amounts[amounts.length-1].toLocaleString('ko-KR')}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 800, responseMimeType: 'application/json' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}`, detail: errText.slice(0, 300) }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); }
    catch {
      const cleaned = reply.replace(/```json|```/g, '').trim();
      try { parsed = JSON.parse(cleaned); }
      catch {
        return new Response(JSON.stringify({ ok: false, error: 'Gemini JSON 파싱 실패', raw: reply.slice(0, 300) }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 최근 거래 5건 첨부
    const recentDeals = finalDeals
      .sort((a, b) => b.dealDate.localeCompare(a.dealDate))
      .slice(0, 5);

    return new Response(JSON.stringify({
      ok: true,
      ...parsed,
      dataPoints: finalDeals.length,
      stats: { avg: Math.round(avg), median, min: amounts[0], max: amounts[amounts.length - 1] },
      recentDeals,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
