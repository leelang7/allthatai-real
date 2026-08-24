/**
 * /api/class-data — 강의 자료실(/class) 데이터 저장소.
 *
 *   GET                  → 공개 조회 (학생용 /class 페이지가 읽음)
 *   POST ?key=ADMIN_KEY  → 저장 (관리 페이지 /class/admin 에서만)
 *
 * 저장 방식은 두 가지를 순서대로 시도한다.
 *   1) Upstash Redis  (UPSTASH_REDIS_REST_URL/TOKEN 이 있으면 — 즉시 반영)
 *   2) GitHub 커밋    (GITHUB_TOKEN/GITHUB_REPO — public/class/data.json 을 갱신)
 *      → 커밋되면 Vercel이 자동 재배포하며 반영된다(1~2분).
 *
 * 둘 다 없으면 저장은 실패하지만 조회는 계속 동작한다(정적 data.json → 기본값).
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

export const GET: APIRoute = async () => {
  // 1) Redis 우선 (있으면 가장 최신)
  const r = redis();
  if (r) {
    try {
      const res = await fetch(`${r.url}/get/${encodeURIComponent(KEY)}`, {
        headers: { Authorization: `Bearer ${r.token}` },
      });
      const d = await res.json();
      if (d?.result) return json({ ok: true, source: 'redis', courses: JSON.parse(d.result) });
    } catch {/* 다음 수단으로 */}
  }

  // 2) GitHub 저장본 (관리 페이지에서 커밋한 최신본)
  const g = github();
  if (g) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${g.repo}/contents/${FILE}?ref=main`,
        { headers: GH_HEADERS(g.token) },
      );
      if (res.ok) {
        const d = await res.json();
        const text = Buffer.from(d.content, 'base64').toString('utf-8');
        const parsed = JSON.parse(text);
        const courses = Array.isArray(parsed) ? parsed : parsed.courses;
        if (Array.isArray(courses) && courses.length) {
          return json({ ok: true, source: 'github', courses });
        }
      }
    } catch {/* 기본값으로 */}
  }

  return json({ ok: true, source: 'default', courses: DEFAULT });
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
    if (!Array.isArray(c.items)) return json({ ok: false, error: `"${c.course}"의 items가 배열이 아님` }, 400);
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

  // 1) Redis 가 있으면 즉시 저장(가장 빠름)
  const r = redis();
  if (r) {
    try {
      const res = await fetch(`${r.url}/set/${encodeURIComponent(KEY)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'text/plain' },
        body: JSON.stringify(courses),
      });
      if (res.ok) return json({ ok: true, via: 'redis', saved: counts });
    } catch {/* GitHub 로 폴백 */}
  }

  // 2) GitHub 에 data.json 커밋 → Vercel 자동 재배포로 반영
  const g = github();
  if (!g) {
    return json({
      ok: false,
      error: '저장소가 연결되지 않았습니다(UPSTASH_* 또는 GITHUB_TOKEN/GITHUB_REPO 필요)',
    }, 503);
  }

  try {
    // 기존 파일의 sha 를 얻어야 덮어쓸 수 있다(없으면 새로 생성).
    let sha: string | undefined;
    const cur = await fetch(
      `https://api.github.com/repos/${g.repo}/contents/${FILE}?ref=main`,
      { headers: GH_HEADERS(g.token) },
    );
    if (cur.ok) sha = (await cur.json()).sha;

    const payload = {
      updated: new Date().toISOString().slice(0, 10),
      courses,
    };
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
