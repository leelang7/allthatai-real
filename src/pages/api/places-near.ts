// 근처 맛집 추천 — '다른 사람들의 실제 행동'(고유 방문자·존맛·재방문) 기준. 별점 아님.
// GET /api/places-near?lat=..&lng=..&radius=1500
import type { APIRoute } from 'astro';
import { nearby } from '../../lib/places-redis';

export const prerender = false;

function j(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const radius = Math.min(Math.max(Number(url.searchParams.get('radius')) || 1500, 100), 5000);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return j({ ok: false, error: 'lat·lng 필요' }, 400);
  }
  const places = await nearby(lat, lng, radius, 20);
  return j({ ok: true, count: places.length, places });
};
