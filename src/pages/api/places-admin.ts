// 수집된 크라우드 음식반응 전체 조회(시각화/관리용).
// GET /api/places-admin  → { ok, count, places:[{name,lat,lng,people,love,quotes,topMenu}] }
import type { APIRoute } from 'astro';
import { allPlaces, storageReady } from '../../lib/places-redis';

export const prerender = false;

export const GET: APIRoute = async () => {
  const places = await allPlaces(500);
  const total = {
    places: places.length,
    reactions: places.reduce((s, p) => s + p.quotes.length, 0),
    people: places.reduce((s, p) => s + p.people, 0),
  };
  return new Response(JSON.stringify({ ok: true, storage: storageReady(), total, places }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
