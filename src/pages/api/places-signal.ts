// 크라우드 존맛 RAG — 앱이 검증된 실제 반응(발화 스니펫)을 익명으로 보낸다. 별점 아님.
// POST {name, lat, lng, quote, menu?, positive, anon}
//   quote = 정제된 실제 발화("들기름막국수 미쳤다"), anon = 익명 기기 해시(개인정보 X)
import type { APIRoute } from 'astro';
import { addReaction, geocodePlace, storageReady } from '../../lib/places-redis';

export const prerender = false;

function j(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let b: any;
  try { b = await request.json(); } catch { return j({ ok: false, error: 'bad json' }, 400); }
  const name = String(b.name || '').trim();
  let lat = Number(b.lat);
  let lng = Number(b.lng);
  const region = String(b.region || '').trim(); // 표현 속 지역 힌트("강남" 등)
  const quote = String(b.quote || '').trim(); // 무의식 행동 기여는 quote 없음(선택)
  const menu = b.menu ? String(b.menu).trim().slice(0, 30) : undefined;
  const positive = b.positive !== false; // 기본 긍정
  const anon = String(b.anon || '').trim().slice(0, 64);
  if (!name || !anon) return j({ ok: false, error: 'name·anon 필요' }, 400);
  if (!storageReady()) return j({ ok: false, error: 'storage_unavailable (Upstash env 미설정)' }, 503);
  // 좌표 없이 표현만 온 경우 → 서버 지오코딩(가게명+지역)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const g = await geocodePlace(name, region);
    if (!g) return j({ ok: false, error: 'geocode_failed' }, 422);
    lat = g.lat; lng = g.lng;
  }
  const r = await addReaction({ name, lat, lng, quote, menu, positive, anon });
  return j({ ...r, lat, lng });
};
