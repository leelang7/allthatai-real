/**
 * /api/class-data — 강의 자료실(/class) 데이터.
 *
 *   GET                    → 학생용. 공개 과정만.
 *   GET ?code=수업코드      → 그 코드에 해당하는 과정까지 함께.
 *   GET ?key=ADMIN_KEY     → 관리자용 원본(접근 설정·코드 포함).
 *   POST ?key=ADMIN_KEY    → 저장.
 *
 * 저장은 Upstash Redis(있으면 즉시) → GitHub 커밋(public/class/data.json) 순으로 시도한다.
 * GitHub 경로는 커밋 후 Vercel 자동 재배포로 1~2분 뒤 반영된다.
 *
 * 접근 제어는 **서버에서** 건다. 다른 반 자료가 브라우저로 아예 내려가지 않아야
 * 반별 독립성이 성립한다(클라이언트 필터링은 소스만 열어도 뚫린다).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const KEY = 'class:data';
const FILE = 'public/class/data.json';

const DEFAULT = [
  {
    course: '공통 자료',
    icon: '📚',
    desc: '모든 과정 공통 자료',
    open: true,
    access: 'public',
    items: [
      {
        icon: '📁',
        title: '강의 자료 폴더',
        desc: '수업 슬라이드·실습 파일 (구글 드라이브)',
        url: 'https://drive.google.com/drive/folders/1NqDl6BeNjKOngikU7QLf2-BPvMAOR6ZV',
        badge: 'NEW',
      },
    ],
  },
];

function env(name: string): string | undefined {
  return (import.meta.env as any)[name] || (process.env as any)[name];
}

function redis() {
  const url = env('UPSTASH_REDIS_REST_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN');
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
  'User-Agent': 'allthatai-class-admin',
  'Content-Type': 'application/json',
});

/**
 * 학생에게 내보낼 목록으로 다듬는다.
 *   access: 'public'(기본) 누구나 / 'code' 코드 일치자만 / 'hidden' 아무에게도 안 보임
 * 응답에는 코드 값을 절대 포함하지 않는다.
 */
function visibleFor(courses: any[], code: string | null) {
  const given = (code || '').trim().toLowerCase();
  return (courses || [])
    .filter((c) => {
      const access = c?.access || 'public';
      if (access === 'hidden') return false;
      if (access === 'code') {
        const want = String(c?.code || '').trim().toLowerCase();
        return !!want && given === want;
      }
      return true;
    })
    .map(({ code: _omit, ...rest }: any) => rest);
}

async function readStored(): Promise<{ source: string; courses: any[] }> {
  const r = redis();
  if (r) {
    try {
      const res = await fetch(`${r.url}/get/${encodeURIComponent(KEY)}`, {
        headers: { Authorization: `Bearer ${r.token}` },
      });
      const d = await res.json();
      if (d?.result) return { source: 'redis', courses: JSON.parse(d.result) };
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
        const courses = Array.isArray(parsed) ? parsed : parsed.courses;
        if (Array.isArray(courses) && courses.length) return { source: 'github', courses };
      }
    } catch {/* 기본값 */}
  }

  return { source: 'default', courses: DEFAULT };
}

export const GET: APIRoute = async ({ url }) => {
  const code = url.searchParams.get('code');
  const ADMIN_KEY = env('ADMIN_KEY');
  const isAdmin = !!ADMIN_KEY && url.searchParams.get('key') === ADMIN_KEY;

  const { source, courses } = await readStored();
  return json({
    ok: true,
    source,
    courses: isAdmin ? courses : visibleFor(courses, code),
  });
};

export const POST: APIRoute = async ({ request, url }) => {
  const ADMIN_KEY = env('ADMIN_KEY');
  if (!ADMIN_KEY) return json({ ok: false, error: 'ADMIN_KEY env 등록 필요' }, 503);

  const key = url.searchParams.get('key') || request.headers.get('x-admin-key');
  if (key !== ADMIN_KEY) return json({ ok: false, error: '인증 실패' }, 401);

  let courses: any;
  try {
    courses = (await request.json())?.courses;
  } catch {
    return json({ ok: false, error: '본문 파싱 실패' }, 400);
  }

  // 형태 검증 — 깨진 데이터가 학생 페이지를 망가뜨리지 않게.
  if (!Array.isArray(courses)) return json({ ok: false, error: 'courses 배열이 아님' }, 400);
  for (const c of courses) {
    if (!c || typeof c.course !== 'string' || !c.course.trim()) {
      return json({ ok: false, error: '과정명이 비어 있는 항목이 있음' }, 400);
    }
    if (!Array.isArray(c.items)) {
      return json({ ok: false, error: `"${c.course}"의 items가 배열이 아님` }, 400);
    }
    const access = c.access || 'public';
    if (!['public', 'code', 'hidden'].includes(access)) {
      return json({ ok: false, error: `"${c.course}"의 접근 설정이 잘못됨` }, 400);
    }
    if (access === 'code' && !String(c.code || '').trim()) {
      return json({ ok: false, error: `"${c.course}"는 코드 공개인데 코드가 비어 있음` }, 400);
    }
    for (const i of c.items) {
      if (!i || typeof i.title !== 'string' || !i.title.trim()) {
        return json({ ok: false, error: `"${c.course}"에 제목 없는 자료가 있음` }, 400);
      }
      if (typeof i.url !== 'string' || !/^https?:\/\//i.test(i.url)) {
        return json({ ok: false, error: `"${i.title}"의 링크가 http(s)로 시작하지 않음` }, 400);
      }
    }
  }

  const counts = {
    courses: courses.length,
    items: courses.reduce((n: number, c: any) => n + c.items.length, 0),
  };

  const r = redis();
  if (r) {
    try {
      const res = await fetch(`${r.url}/set/${encodeURIComponent(KEY)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'text/plain' },
        body: JSON.stringify(courses),
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

    const payload = { updated: new Date().toISOString().slice(0, 10), courses };
    const body = {
      message: `chore(class): 자료실 갱신 (과정 ${counts.courses} · 자료 ${counts.items})`,
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
