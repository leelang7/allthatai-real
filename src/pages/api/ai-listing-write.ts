/**
 * /api/ai-listing-write — AI 매물 광고 작성.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 부동산 매물 광고 카피라이터입니다. 매물 정보 → 매력적이고 정직한 광고문.

원칙:
- 정직 (과장·허위 광고 금지)
- SEO 키워드 자연스럽게
- 직거래·중개 모두 활용 가능
- 사기 매물처럼 보이지 않게

응답 JSON ONLY:
{
  "title": "광고 제목 (40자 이내, SEO 키워드 포함)",
  "shortDesc": "한 줄 설명 (50자 이내)",
  "fullDescription": "본문 (마크다운 가능, 250~400자)",
  "highlights": ["대표 강점 5개 (불릿)"],
  "callToAction": "마무리 CTA 한 줄",
  "hashtags": ["#태그1", ...],
  "platforms": [{"platform":"네이버부동산|직방|당근|기타", "tip":"플랫폼별 활용 팁"}],
  "honestyCheck": ["과장 표현 제거 권장 1", ...],
  "photoTips": ["사진 촬영 팁 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const p = {
    propertyType: body?.propertyType || '아파트',
    dealType: body?.dealType || 'sale',
    price: +body?.price || 0,
    deposit: +body?.deposit || 0,
    monthly: +body?.monthly || 0,
    region: body?.region || '',
    complex: body?.complex || '',
    area: body?.area || '',
    floor: body?.floor || '',
    rooms: body?.rooms || '',
    features: body?.features || '',
    cons: body?.cons || '',
  };
  if (!p.region) return new Response(JSON.stringify({ ok: false, error: '지역 필수' }), { status: 400 });

  const priceStr = p.dealType === 'sale' ? `매매가 ${p.price.toLocaleString('ko-KR')}원`
    : p.dealType === 'jeonse' ? `전세 ${p.deposit.toLocaleString('ko-KR')}원`
    : `보증금 ${p.deposit.toLocaleString('ko-KR')} / 월세 ${p.monthly.toLocaleString('ko-KR')}원`;

  const userMsg = `매물 광고 작성:
- 유형: ${p.propertyType} (${p.dealType === 'sale' ? '매매' : p.dealType === 'jeonse' ? '전세' : '월세'})
- 가격: ${priceStr}
- 위치: ${p.region}
- 단지/건물: ${p.complex || '미입력'}
- 면적: ${p.area || '미입력'}
- 층: ${p.floor || '미입력'}
- 방·욕실: ${p.rooms || '미입력'}
- 강점/특징: ${p.features || '없음'}
- 단점 (정직 공개): ${p.cons || '없음'}

매력적이고 정직한 광고를 작성하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2500, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); }
    catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 });
  }
};
