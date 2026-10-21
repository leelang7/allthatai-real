// 크루 대항 — 크루별 주간 러닝 거리 합으로 순위(Ditto 아지트 패권 랭킹을 러닝에).
// POST {op:'create', name, memberId, nick}         → {crewId, code, token}
// POST {op:'join', code, memberId, nick}           → {crewId, name, token}
// POST {op:'report', crewId, memberId, token, week, meters, runs}  — 그 주 누적(멱등)
// POST {op:'board', week?, by?:'total'|'avg', crewId?}            → 순위·우리 크루·멤버 기여
// memberId 가 'test-' 로 시작하면 저장하지 않는다(프로덕션 스모크 격리).
import type { APIRoute } from 'astro';
import { board, createCrew, crewStorageReady, joinCrew, reportWeek } from '../../lib/crew';

export const prerender = false;

function j(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let b: any;
  try { b = await request.json(); } catch { return j({ ok: false, error: 'bad json' }, 400); }
  const op = String(b?.op ?? '');
  const test = String(b?.memberId ?? '').startsWith('test-');
  if (!test && !crewStorageReady()) return j({ ok: false, error: 'storage_unavailable' }, 503);
  try {
    const r = op === 'create' ? await createCrew(b)
      : op === 'join' ? await joinCrew(b)
      : op === 'report' ? await reportWeek(b)
      : op === 'board' ? await board(b)
      : { ok: false as const, error: 'op 는 create·join·report·board', status: 400 };
    if (!r.ok) return j({ ok: false, error: r.error }, r.status);
    return j(r);
  } catch (e) {
    return j({ ok: false, error: 'storage_error' }, 502);
  }
};
