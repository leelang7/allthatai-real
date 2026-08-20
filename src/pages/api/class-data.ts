/**
 * /api/class-data — 강의 자료실(/class) 데이터 저장소.
 *
 *   GET                  → 공개 조회 (학생용 /class 페이지가 읽음)
 *   POST ?key=ADMIN_KEY  → 저장 (관리 페이지 /class/admin 에서만)
 *
 * 데이터: Upstash Redis (env UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 * 키: class:data  — 과정(폴더) 배열 JSON 한 덩어리
 *
 * Redis가 없거나 저장된 값이 없으면 기본 데이터(DEFAULT)를 돌려준다.
 * 즉 관리 페이지를 한 번도 안 써도 /class 는 항상 정상 동작한다.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const KEY = 'class:data';

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const GET: APIRoute = async () => {
  const r = redis();
  if (!r) return json({ ok: true, stored: false, courses: DEFAULT });
  try {
    const res = await fetch(`${r.url}/get/${encodeURIComponent(KEY)}`, {
      headers: { Authorization: `Bearer ${r.token}` },
    });
    const d = await res.json();
    if (!d?.result) return json({ ok: true, stored: false, courses: DEFAULT });
    const courses = JSON.parse(d.result);
    return json({ ok: true, stored: true, courses });
  } catch {
    return json({ ok: true, stored: false, courses: DEFAULT });
  }
};

export const POST: APIRoute = async ({ request, url }) => {
  const ADMIN_KEY = env('ADMIN_KEY');
  if (!ADMIN_KEY) return json({ ok: false, error: 'ADMIN_KEY env 등록 필요' }, 503);

  const key = url.searchParams.get('key') || request.headers.get('x-admin-key');
  if (key !== ADMIN_KEY) return json({ ok: false, error: '인증 실패' }, 401);

  const r = redis();
  if (!r) return json({ ok: false, error: 'Upstash Redis 미등록(UPSTASH_REDIS_REST_URL/TOKEN)' }, 503);

  let courses: any;
  try {
    const body = await request.json();
    courses = body?.courses;
  } catch {
    return json({ ok: false, error: '본문 파싱 실패' }, 400);
  }

  // 최소 검증 — 형태가 깨진 데이터가 학생 페이지를 망가뜨리지 않게.
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

  try {
    const res = await fetch(`${r.url}/set/${encodeURIComponent(KEY)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(courses),
    });
    if (!res.ok) return json({ ok: false, error: `Redis 저장 실패(${res.status})` }, 502);
    const courseCount = courses.length;
    const itemCount = courses.reduce((n: number, c: any) => n + c.items.length, 0);
    return json({ ok: true, saved: { courses: courseCount, items: itemCount } });
  } catch (e: any) {
    return json({ ok: false, error: `저장 오류: ${e?.message || e}` }, 502);
  }
};
