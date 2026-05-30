/**
 * 액세스 코드 게이트 — "내 GPU 모델은 나·지정인만".
 *
 * env ACCESS_CODES = "code1,code2,code3" (콤마 구분, 발급/회수는 여기서)
 *   - 비어 있으면 게이트 비활성(전부 허용) — 개발 편의
 * 요청은 헤더 X-Access-Code 또는 body.accessCode 로 코드 전달.
 *
 * 모델 서버(verify.allthatai.kr) 호출 시 X-API-Key 도 여기서 주입.
 */

export function allowedCodes(): Set<string> {
  const raw = (import.meta.env as any).ACCESS_CODES || process.env.ACCESS_CODES || '';
  return new Set(
    raw.split(',').map((c: string) => c.trim()).filter(Boolean)
  );
}

/** 요청에서 코드 추출 (헤더 우선, 없으면 body). */
export function extractCode(request: Request, body?: any): string {
  return (request.headers.get('X-Access-Code') || body?.accessCode || '').toString().trim();
}

/**
 * 게이트 통과 여부.
 * codes가 비어 있으면(미설정) 통과(개발). 설정돼 있으면 코드 일치해야 통과.
 */
export function checkAccess(request: Request, body?: any): { ok: boolean; reason?: string } {
  const codes = allowedCodes();
  if (codes.size === 0) return { ok: true };           // 게이트 미설정 = 허용
  const code = extractCode(request, body);
  if (!code) return { ok: false, reason: 'access_code_required' };
  if (!codes.has(code)) return { ok: false, reason: 'invalid_access_code' };
  return { ok: true };
}

/** 모델 서버 호출용 헤더 (X-API-Key 주입). */
export function modelHeaders(extra?: Record<string, string>): Record<string, string> {
  const key = (import.meta.env as any).SCAM_MODEL_KEY || process.env.SCAM_MODEL_KEY || '';
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'AllThatAI-Server/1.0',  // Cloudflare 봇 차단 회피
    ...(key ? { 'X-API-Key': key } : {}),
    ...(extra || {}),
  };
}

export function forbidden(reason: string): Response {
  const msg = reason === 'access_code_required'
    ? '액세스 코드가 필요합니다. 발급받은 코드를 입력해 주세요.'
    : '유효하지 않은 액세스 코드입니다.';
  return new Response(JSON.stringify({ ok: false, error: msg, reason }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}
