/**
 * Google Vision Web Detection — 이미지가 웹 어디에 있는지 역검색.
 * (구글렌즈가 하는 것의 공식 API 버전)
 *
 * env: GOOGLE_VISION_KEY (없으면 GEMINI_API_KEY 재시도 — 같은 Cloud 프로젝트면 통할 수 있음)
 *
 * 반환: 동일/유사 이미지가 발견된 웹페이지 목록 + 매칭 개수.
 *   여러 페이지·여러 도메인에 같은 사진이 있으면 도용 정황.
 */

export interface WebMatchPage {
  url: string;
  title: string;
}

export interface WebDetectionResult {
  available: boolean;            // API 호출 성공 여부
  fullMatches: number;          // 완전 동일 이미지 수
  partialMatches: number;       // 부분 매칭 수
  pages: WebMatchPage[];        // 이 이미지가 있는 웹페이지
  entities: string[];           // 추정 키워드 (인물명 등)
  bestGuessLabel: string | null;
  error?: string;
}

function visionKey(): string {
  return (
    (import.meta.env as any).GOOGLE_VISION_KEY ||
    process.env.GOOGLE_VISION_KEY ||
    (import.meta.env as any).GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  );
}

/** base64(data:image/... 또는 순수) → Web Detection. */
export async function webDetect(imageInput: string): Promise<WebDetectionResult> {
  const key = visionKey();
  if (!key) return { available: false, fullMatches: 0, partialMatches: 0, pages: [], entities: [], bestGuessLabel: null, error: 'no_key' };

  const content = imageInput.includes(',') ? imageInput.split(',')[1] : imageInput;
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${key}`;
  const body = {
    requests: [
      {
        image: { content },
        features: [{ type: 'WEB_DETECTION', maxResults: 15 }],
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = await res.text();
      return { available: false, fullMatches: 0, partialMatches: 0, pages: [], entities: [], bestGuessLabel: null, error: `vision_${res.status}: ${t.slice(0, 120)}` };
    }
    const data = await res.json() as any;
    const wd = data?.responses?.[0]?.webDetection || {};
    const full = wd.fullMatchingImages || [];
    const partial = wd.partialMatchingImages || [];
    const pagesRaw = wd.pagesWithMatchingImages || [];
    const pages: WebMatchPage[] = pagesRaw.slice(0, 12).map((p: any) => ({
      url: p.url || '',
      title: (p.pageTitle || '').replace(/<[^>]+>/g, '').slice(0, 100),
    })).filter((p: WebMatchPage) => p.url);
    const entities = (wd.webEntities || [])
      .filter((e: any) => e.description && e.score > 0.3)
      .slice(0, 6)
      .map((e: any) => e.description);
    const bestGuessLabel = wd.bestGuessLabels?.[0]?.label || null;

    return {
      available: true,
      fullMatches: full.length,
      partialMatches: partial.length,
      pages,
      entities,
      bestGuessLabel,
    };
  } catch (e) {
    return { available: false, fullMatches: 0, partialMatches: 0, pages: [], entities: [], bestGuessLabel: null, error: e instanceof Error ? e.message : 'fetch_failed' };
  }
}

/** 웹 매칭 결과 → 도용 정황 점수(0~100) + 사유. */
export function webTheftSignal(w: WebDetectionResult): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  if (!w.available) return { score: 0, reasons: [] };

  const uniqueDomains = new Set(w.pages.map((p) => {
    try { return new URL(p.url).hostname.replace(/^www\./, ''); } catch { return p.url; }
  }));

  let score = 0;
  if (w.fullMatches >= 1 && uniqueDomains.size >= 3) {
    // 같은 사진이 3개 이상 다른 사이트에 = 널리 퍼진 사진(도용 가능성 또는 유명/스톡)
    score = 70;
    reasons.push(`이 사진이 ${uniqueDomains.size}개 이상의 다른 웹사이트에서 발견됐어요 — 도용되었거나 널리 퍼진 사진일 수 있습니다`);
  } else if (w.fullMatches >= 1 && uniqueDomains.size >= 1) {
    score = 40;
    reasons.push(`이 사진과 동일한 이미지가 웹(${uniqueDomains.size}곳)에서 발견됐어요 — 출처를 확인하세요`);
  } else if (w.partialMatches >= 3) {
    score = 30;
    reasons.push('비슷한 이미지가 웹에 여러 개 있습니다 — 변형 도용일 수 있어요');
  }
  if (w.bestGuessLabel) {
    reasons.push(`웹 추정: "${w.bestGuessLabel}"`);
  }
  return { score, reasons };
}
