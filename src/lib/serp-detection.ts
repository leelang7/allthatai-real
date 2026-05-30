/**
 * SerpApi Google Lens — 이미지 역검색 (블로그·일부 SNS까지 구글렌즈 수준).
 *
 * SerpApi는 공개 이미지 URL을 요구하므로:
 *   1) 업로드 이미지를 모델서버 /tmphost 에 올려 임시 공개 URL 획득 (10분 TTL)
 *   2) SerpApi google_lens(url) 호출 → visual_matches
 *
 * env: SERPAPI_KEY (없으면 비활성). SCAM_MODEL_API/KEY (임시호스팅).
 */
import { modelHeaders } from './access-gate';

export interface SerpMatch {
  title: string;
  link: string;
  source: string;
}

export interface SerpResult {
  available: boolean;
  matches: SerpMatch[];
  error?: string;
}

function serpKey(): string {
  return (import.meta.env as any).SERPAPI_KEY || process.env.SERPAPI_KEY || '';
}

/** 이미지 base64 → 모델서버 임시 URL. 실패 시 null. */
async function hostTemp(imageInput: string): Promise<string | null> {
  const modelApi = (import.meta.env as any).SCAM_MODEL_API || process.env.SCAM_MODEL_API;
  if (!modelApi) return null;
  try {
    const res = await fetch(`${modelApi}/tmphost`, {
      method: 'POST',
      headers: modelHeaders(),
      body: JSON.stringify({ image_b64: imageInput, public_base: modelApi }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.url || null;
  } catch { return null; }
}

/** SerpApi Google Lens 역검색. */
export async function serpLensDetect(imageInput: string): Promise<SerpResult> {
  const key = serpKey();
  if (!key) return { available: false, matches: [], error: 'no_serpapi_key' };

  const imgUrl = await hostTemp(imageInput);
  if (!imgUrl) return { available: false, matches: [], error: 'temp_host_failed' };

  try {
    const url = `https://serpapi.com/search.json?engine=google_lens&type=all&url=${encodeURIComponent(imgUrl)}&api_key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      const t = await res.text();
      return { available: false, matches: [], error: `serpapi_${res.status}: ${t.slice(0, 100)}` };
    }
    const data = await res.json() as any;
    const vm = data?.visual_matches || [];
    const matches: SerpMatch[] = vm.slice(0, 15).map((m: any) => ({
      title: (m.title || '').slice(0, 100),
      link: m.link || '',
      source: m.source || '',
    })).filter((m: SerpMatch) => m.link);
    return { available: true, matches };
  } catch (e) {
    return { available: false, matches: [], error: e instanceof Error ? e.message : 'fetch_failed' };
  }
}

/** SerpApi 결과 → 도용 정황 점수 + 사유. */
export function serpTheftSignal(r: SerpResult): { score: number; reasons: string[] } {
  if (!r.available || !r.matches.length) return { score: 0, reasons: [] };

  const domains = new Set(r.matches.map((m) => {
    try { return new URL(m.link).hostname.replace(/^www\./, ''); } catch { return m.source || m.link; }
  }));
  // 인스타·블로그 등 SNS 도메인 가중
  const snsHit = [...domains].some((d) =>
    /instagram|facebook|tistory|blog\.naver|cafe\.naver|twitter|x\.com|threads/.test(d));

  const reasons: string[] = [];
  let score = 0;
  if (domains.size >= 4) {
    score = 70;
    reasons.push(`구글렌즈: 이 사진이 ${domains.size}개 이상 다른 출처에서 발견됐어요${snsHit ? ' (SNS·블로그 포함)' : ''} — 도용 가능성 높음`);
  } else if (domains.size >= 2) {
    score = 45;
    reasons.push(`구글렌즈: ${domains.size}곳에서 동일/유사 이미지 발견 — 출처를 확인하세요`);
  } else if (domains.size === 1) {
    score = 25;
    reasons.push('구글렌즈: 다른 출처 1곳에서 발견됨');
  }
  return { score, reasons };
}
