// 크라우드 "존맛" 네트워크 — 여러 사람의 실제 행동(방문·재방문·존맛반응)을 익명 집계.
// 별점 아님. Upstash Redis GEO + HyperLogLog(고유 사람 수)로 온-서버 집계.
// keys:
//   places:geo                 GEOADD(lng,lat, placeId)          — 위치 인덱스
//   place:{id}:meta            HASH {name, lat, lng}
//   place:{id}:people          HLL  (PFADD anon)                 — 실제 고유 방문자 수
//   place:{id}:love            counter                           — "존맛" 반응 수
//   place:{id}:revisit         counter                           — 재방문(단골) 신호 수

function env() {
  const url = (import.meta.env as any).UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = (import.meta.env as any).UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function cmd(parts: (string | number)[]): Promise<any> {
  const e = env();
  if (!e) return null;
  const r = await fetch(e.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(parts),
  });
  if (!r.ok) return null;
  return (await r.json().catch(() => null))?.result ?? null;
}

/** Redis 연결 가능 여부(진단용 — 저장 실패를 조용히 삼키지 않기 위해). */
export function storageReady(): boolean {
  return env() !== null;
}

async function pipe(cmds: (string | number)[][]): Promise<any[]> {
  const e = env();
  if (!e) return [];
  const r = await fetch(`${e.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  return Array.isArray(j) ? j.map((x) => x?.result ?? null) : [];
}

/** 가게명(+지역 힌트) → 좌표. Nominatim(무료·키없음) + Redis 캐시(재조회 0원, rate limit 회피).
 *  카카오 로컬 키가 생기면 여기만 교체하면 됨(KAKAO_REST_KEY env 있으면 카카오 우선). */
export async function geocodePlace(
  name: string, region?: string,
): Promise<{ lat: number; lng: number } | null> {
  const q = [region, name].filter(Boolean).join(' ').trim();
  if (!q) return null;
  const ck = `geo:cache:${q.toLowerCase().replace(/\s+/g, ' ')}`;
  const hit = await cmd(['GET', ck]);
  if (typeof hit === 'string') {
    if (hit === 'miss') return null; // 못 찾은 것도 캐시(반복 낭비 방지)
    const [la, lo] = hit.split(',').map(Number);
    if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lng: lo };
  }
  let out: { lat: number; lng: number } | null = null;
  // 카카오 키 있으면 우선(정확), 없으면 Nominatim
  const kakao = (import.meta.env as any).KAKAO_REST_KEY || process.env.KAKAO_REST_KEY;
  try {
    if (kakao) {
      const r = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=1`,
        { headers: { Authorization: `KakaoAK ${kakao}` } });
      const j: any = await r.json().catch(() => null);
      const d = j?.documents?.[0];
      if (d) out = { lat: parseFloat(d.y), lng: parseFloat(d.x) };
    }
    if (!out) {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=kr&limit=1`,
        { headers: { 'User-Agent': 'AllThatAI-places/1.0 (real.allthatai.kr)' } });
      const j: any = await r.json().catch(() => null);
      if (Array.isArray(j) && j[0]) out = { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
    }
  } catch { /* 네트워크 실패 → null */ }
  await cmd(['SET', ck, out ? `${out.lat},${out.lng}` : 'miss', 'EX', 60 * 86400]);
  return out;
}

/** 같은 실제 장소를 기여자끼리 합치는 안정적 id: 정규화한 이름 + ~11m 격자. */
export function placeId(name: string, lat: number, lng: number): string {
  const n = (name || '')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, '')
    .slice(0, 24) || 'spot';
  const la = lat.toFixed(4);
  const lo = lng.toFixed(4);
  return `${n}@${la},${lo}`;
}

export interface Reaction {
  name: string; // 가게명
  lat: number;
  lng: number;
  quote?: string; // 실제 발화(있으면). 무의식 행동 기여는 텍스트 없음 → 생략.
  menu?: string; // 추출된 메뉴(있으면)
  positive: boolean; // 긍정(무의식 행동으로 판정된 '진짜 좋아함' 포함)
  anon: string; // 익명 기기 해시
}

/** 검증된 반응 1건을 풀에 적재. 텍스트(quote)는 있으면 RAG 스니펫으로, 없으면 행동 신호만. */
export async function addReaction(r: Reaction): Promise<{ ok: boolean; id: string }> {
  const id = placeId(r.name, r.lat, r.lng);
  const cmds: (string | number)[][] = [
    ['GEOADD', 'places:geo', r.lng, r.lat, id],
    ['HSET', `place:${id}:meta`, 'name', r.name.slice(0, 60), 'lat', r.lat, 'lng', r.lng],
    ['PFADD', `place:${id}:people`, r.anon], // 고유 인원(무의식 발굴, 조작 방지)
  ];
  const quote = (r.quote || '').trim().slice(0, 140);
  if (quote) {
    const snippet = JSON.stringify({ q: quote, m: r.menu || '', t: r.positive ? 1 : 0 });
    cmds.push(['LPUSH', `place:${id}:quotes`, snippet], ['LTRIM', `place:${id}:quotes`, 0, 40]);
  }
  if (r.positive) cmds.push(['INCR', `place:${id}:love`]); // 진짜 좋아함(행동/발화 무관)
  if (r.menu) cmds.push(['ZINCRBY', `place:${id}:menus`, 1, r.menu.slice(0, 30)]);
  await pipe(cmds);
  return { ok: true, id };
}

export interface NearPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distM: number;
  people: number; // 실제 고유 방문자 수
  love: number; // 긍정 반응 수
  quotes: string[]; // 실제 발화 스니펫(RAG): "들기름막국수 미쳤다"
  topMenu?: string; // 가장 많이 언급된 메뉴
  score: number; // 실행동 종합(별점 아님)
}

export interface AdminPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  people: number;
  love: number;
  quotes: { q: string; m: string; pos: boolean }[];
  topMenu?: string;
}

/** 수집된 전체 장소 + 반응(시각화/관리용). geo set 전체를 훑는다. */
export async function allPlaces(limit = 500): Promise<AdminPlace[]> {
  const ids = await cmd(['ZRANGE', 'places:geo', 0, limit - 1]);
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const metaCmds = ids.flatMap((id: string) => [
    ['HGETALL', `place:${id}:meta`],
    ['PFCOUNT', `place:${id}:people`],
    ['GET', `place:${id}:love`],
    ['LRANGE', `place:${id}:quotes`, 0, 20],
    ['ZRANGE', `place:${id}:menus`, 0, 0, 'REV'],
  ]);
  const flat = await pipe(metaCmds);
  const out: AdminPlace[] = [];
  ids.forEach((id: string, i: number) => {
    const meta = flat[i * 5];
    const m: Record<string, string> = {};
    if (Array.isArray(meta)) {
      for (let k = 0; k + 1 < meta.length; k += 2) m[meta[k]] = meta[k + 1];
    } else if (meta && typeof meta === 'object') {
      Object.assign(m, meta);
    }
    const rawQuotes = Array.isArray(flat[i * 5 + 3]) ? flat[i * 5 + 3] : [];
    const menuArr = Array.isArray(flat[i * 5 + 4]) ? flat[i * 5 + 4] : [];
    const quotes = rawQuotes.map((s: string) => {
      try { const o = JSON.parse(s); return { q: o.q || '', m: o.m || '', pos: o.t === 1 }; }
      catch { return null; }
    }).filter(Boolean) as { q: string; m: string; pos: boolean }[];
    out.push({
      id,
      name: m.name || id.split('@')[0],
      lat: Number(m.lat) || 0,
      lng: Number(m.lng) || 0,
      people: Number(flat[i * 5 + 1]) || 0,
      love: Number(flat[i * 5 + 2]) || 0,
      quotes,
      topMenu: menuArr[0] || undefined,
    });
  });
  out.sort((a, b) => b.people - a.people);
  return out;
}

/** 근처 장소를 '다른 사람들의 실제 발화/행동' 기준으로 랭킹 + 실제 멘트 반환(RAG). */
export async function nearby(
  lat: number, lng: number, radiusM = 1500, limit = 20,
): Promise<NearPlace[]> {
  const res = await cmd([
    'GEOSEARCH', 'places:geo', 'FROMLONLAT', lng, lat,
    'BYRADIUS', radiusM, 'm', 'ASC', 'WITHCOORD', 'WITHDIST', 'COUNT', 80,
  ]);
  if (!Array.isArray(res) || res.length === 0) return [];
  const ids: string[] = res.map((x: any) => x[0]);
  const metaCmds = ids.flatMap((id) => [
    ['PFCOUNT', `place:${id}:people`],
    ['GET', `place:${id}:love`],
    ['LRANGE', `place:${id}:quotes`, 0, 4],
    ['ZRANGE', `place:${id}:menus`, 0, 0, 'REV'],
  ]);
  const flat = await pipe(metaCmds);
  const out: NearPlace[] = [];
  res.forEach((x: any, i: number) => {
    const id = x[0];
    const distM = parseFloat(x[1]) || 0;
    const coord = x[2] || [];
    const people = Number(flat[i * 4]) || 0;
    const love = Number(flat[i * 4 + 1]) || 0;
    const rawQuotes = Array.isArray(flat[i * 4 + 2]) ? flat[i * 4 + 2] : [];
    const menuArr = Array.isArray(flat[i * 4 + 3]) ? flat[i * 4 + 3] : [];
    const quotes: string[] = [];
    for (const s of rawQuotes) {
      try {
        const o = JSON.parse(s);
        if (o.t === 1 && o.q) quotes.push(o.q); // 긍정 발화만 노출
      } catch { /* skip */ }
    }
    const behavior = people * 1.0 + love * 1.5;
    const decay = 1 / (1 + distM / 400);
    out.push({
      id,
      name: id.split('@')[0],
      lat: parseFloat(coord[1]) || lat,
      lng: parseFloat(coord[0]) || lng,
      distM: Math.round(distM),
      people,
      love,
      quotes: quotes.slice(0, 3),
      topMenu: menuArr[0] || undefined,
      score: behavior * decay,
    });
  });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
