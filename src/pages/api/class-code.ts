/**
 * /api/class-code — 강의 코드 공유(/class/code) 데이터.
 *
 *   GET                 → 학생용. 스니펫 전체(코드 공유는 공개).
 *   GET ?key=ADMIN_KEY  → 관리자용(동일하지만 관리 화면에서 사용).
 *   POST ?key=ADMIN_KEY → 저장.
 *
 * class-data.ts 와 동일한 방식: Upstash Redis(있으면 즉시) → GitHub 커밋
 * (public/class/code.json) 순. GitHub 경로는 커밋 후 Vercel 재배포로 1~2분 뒤 반영.
 * 환경변수(ADMIN_KEY / GITHUB_TOKEN / GITHUB_REPO / UPSTASH_*)는 자료실과 공유한다.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const KEY = 'class:code';
const FILE = 'public/class/code.json';

const DEFAULT: any[] = [
  {
    id: 'sample',
    title: '예시 · Hello, class',
    course: '공통',
    lang: 'python',
    desc: '관리자 화면에서 이 스니펫을 지우고 수업 코드를 올리세요.',
    code: 'print("안녕하세요, 수업에 오신 걸 환영합니다!")',
  },
];

function env(name: string): string | undefined {
  return (import.meta.env as any)[name] || (process.env as any)[name];
}

function redis() {
  // 프로덕션에는 Vercel KV 가 `KV_REST_API_*` 로 들어와 있고 `UPSTASH_*` 는 없다.
  // UPSTASH 만 보면 redis() 가 null 이라 저장이 GitHub 커밋 경로로 떨어지고,
  // 반영이 재배포까지 1~2분 걸린다. crowd.ts·quota-gate.ts 와 같은 폴백을 둔다.
  const url = env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN');
  return url && token ? { url, token } : null;
}

function github() {
  const token = env('GITHUB_TOKEN');
  const repo = env('GITHUB_REPO');
  return token && repo ? { token, repo } : null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'allthatai-class-code',
  'Content-Type': 'application/json',
});

async function readStored(): Promise<{ source: string; snippets: any[] }> {
  const r = redis();
  if (r) {
    try {
      const res = await fetch(`${r.url}/get/${encodeURIComponent(KEY)}`, {
        headers: { Authorization: `Bearer ${r.token}` },
      });
      const d = await res.json();
      if (d?.result) return { source: 'redis', snippets: JSON.parse(d.result) };
    } catch {/* 다음 수단 */}
  }

  const g = github();
  if (g) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${g.repo}/contents/${FILE}?ref=main`,
        { headers: GH_HEADERS(g.token) },
      );
      if (res.ok) {
        const d = await res.json();
        const parsed = JSON.parse(Buffer.from(d.content, 'base64').toString('utf-8'));
        const snippets = Array.isArray(parsed) ? parsed : parsed.snippets;
        if (Array.isArray(snippets)) return { source: 'github', snippets };
      }
    } catch {/* 기본값 */}
  }

  return { source: 'default', snippets: DEFAULT };
}

export const GET: APIRoute = async () => {
  const { source, snippets } = await readStored();
  return json({ ok: true, source, snippets });
};

export const POST: APIRoute = async ({ request, url }) => {
  const ADMIN_KEY = env('ADMIN_KEY');
  if (!ADMIN_KEY) return json({ ok: false, error: 'ADMIN_KEY env 등록 필요' }, 503);

  const key = url.searchParams.get('key') || request.headers.get('x-admin-key');
  if (key !== ADMIN_KEY) return json({ ok: false, error: '인증 실패' }, 401);

  let snippets: any;
  try {
    snippets = (await request.json())?.snippets;
  } catch {
    return json({ ok: false, error: '본문 파싱 실패' }, 400);
  }

  // 형태 검증 — 깨진 데이터가 학생 페이지를 망가뜨리지 않게.
  if (!Array.isArray(snippets)) return json({ ok: false, error: 'snippets 배열이 아님' }, 400);
  for (const s of snippets) {
    if (!s || typeof s.title !== 'string' || !s.title.trim()) {
      return json({ ok: false, error: '제목이 비어 있는 스니펫이 있음' }, 400);
    }
    if (typeof s.code !== 'string' || !s.code.length) {
      return json({ ok: false, error: `"${s.title}"의 코드가 비어 있음` }, 400);
    }
  }

  const counts = { snippets: snippets.length };

  const r = redis();
  if (r) {
    try {
      const res = await fetch(`${r.url}/set/${encodeURIComponent(KEY)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'text/plain' },
        body: JSON.stringify(snippets),
      });
      if (res.ok) return json({ ok: true, via: 'redis', saved: counts });
    } catch {/* GitHub 폴백 */}
  }

  const g = github();
  if (!g) {
    return json({
      ok: false,
      error: '저장소가 연결되지 않았습니다(UPSTASH_* 또는 GITHUB_TOKEN/GITHUB_REPO 필요)',
    }, 503);
  }

  try {
    let sha: string | undefined;
    const cur = await fetch(
      `https://api.github.com/repos/${g.repo}/contents/${FILE}?ref=main`,
      { headers: GH_HEADERS(g.token) },
    );
    if (cur.ok) sha = (await cur.json()).sha;

    const payload = { updated: new Date().toISOString().slice(0, 10), snippets };
    const body = {
      message: `chore(class): 코드 공유 갱신 (스니펫 ${counts.snippets}개)`,
      content: Buffer.from(JSON.stringify(payload, null, 2), 'utf-8').toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    };

    const put = await fetch(`https://api.github.com/repos/${g.repo}/contents/${FILE}`, {
      method: 'PUT',
      headers: GH_HEADERS(g.token),
      body: JSON.stringify(body),
    });

    if (!put.ok) {
      const t = await put.text();
      return json({ ok: false, error: `GitHub 저장 실패(${put.status}) ${t.slice(0, 120)}` }, 502);
    }
    return json({ ok: true, via: 'github', saved: counts, note: '1~2분 뒤 반영됩니다' });
  } catch (e: any) {
    return json({ ok: false, error: `저장 오류: ${e?.message || e}` }, 502);
  }
};
