// node --import ./scripts/crew/resolve-ts.mjs --test scripts/crew/crew-store.test.ts
// 가짜 Redis(REST pipeline) 위에서 crew.ts 를 끝까지 — 프로덕션 데이터는 건드리지 않는다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── 가짜 Upstash: 쓰는 명령만 ──
const kv = new Map<string, any>();
function run([cmd, ...a]: any[]): any {
  const k = String(a[0]);
  switch (String(cmd).toUpperCase()) {
    case 'INCR': { const v = (Number(kv.get(k)) || 0) + 1; kv.set(k, v); return v; }
    case 'EXPIRE': return 1;
    case 'SET': { if (a.includes('NX') && kv.has(k)) return null; kv.set(k, String(a[1])); return 'OK'; }
    case 'GET': return kv.get(k) ?? null;
    case 'HSET': { const h = kv.get(k) ?? new Map(); for (let i = 1; i + 1 < a.length; i += 2) h.set(String(a[i]), String(a[i + 1])); kv.set(k, h); return 1; }
    case 'HGET': return kv.get(k)?.get(String(a[1])) ?? null;
    case 'HLEN': return kv.get(k)?.size ?? 0;
    case 'HDEL': return kv.get(k)?.delete(String(a[1])) ? 1 : 0;
    case 'HVALS': return [...(kv.get(k)?.values() ?? [])];
    case 'HGETALL': return [...(kv.get(k)?.entries() ?? [])].flat();
    case 'ZADD': { const z = kv.get(k) ?? new Map(); z.set(String(a[2]), Number(a[1])); kv.set(k, z); return 1; }
    case 'ZREM': return kv.get(k)?.delete(String(a[1])) ? 1 : 0;
    case 'ZSCORE': { const v = kv.get(k)?.get(String(a[1])); return v == null ? null : String(v); }
    case 'ZREVRANGE': {
      const z: Map<string, number> = kv.get(k) ?? new Map();
      return [...z.entries()].sort((x, y) => y[1] - x[1]).slice(Number(a[1]), Number(a[2]) + 1).flatMap(([m, s]) => [m, String(s)]);
    }
  }
  throw new Error('unsupported ' + cmd);
}
let server: http.Server;
before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { res.end(JSON.stringify(JSON.parse(body).map((c: any[]) => ({ result: run(c) })))); });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake';
  process.env.CREW_SECRET = 'test-secret';
});
after(() => server.close());

const { createCrew, joinCrew, reportWeek, board } = await import('../../src/lib/crew.ts');
const { isoWeekKST } = await import('../../src/lib/crew-core.ts');
const week = isoWeekKST(new Date());

test('★ 만들고·들어오고·보고하면 크루 합으로 순위가 선다', async () => {
  const a = await createCrew({ name: '한강런', memberId: 'devA0000001', nick: '민수' }) as any;
  assert.equal(a.ok, true);
  assert.match(a.code, /^[A-Z2-9]{6}$/);
  const b = await joinCrew({ code: a.code.toLowerCase(), memberId: 'devB0000001', nick: '지영' }) as any;
  assert.equal(b.ok, true);
  assert.equal(b.crewId, a.crewId);
  const c = await createCrew({ name: '새벽런', memberId: 'devC0000001', nick: '철수' }) as any;

  assert.equal((await reportWeek({ crewId: a.crewId, memberId: 'devA0000001', token: a.token, week, meters: 21000, runs: 3 }) as any).crewTotal, 21000);
  assert.equal((await reportWeek({ crewId: a.crewId, memberId: 'devB0000001', token: b.token, week, meters: 10000, runs: 2 }) as any).crewTotal, 31000);
  await reportWeek({ crewId: c.crewId, memberId: 'devC0000001', token: c.token, week, meters: 25000, runs: 4 });

  const t = await board({ week, crewId: c.crewId }) as any;
  assert.deepEqual(t.top.map((r: any) => [r.name, r.rank, r.total]), [['한강런', 1, 31000], ['새벽런', 2, 25000]]);
  assert.equal(t.mine.rank, 2);
  assert.equal(t.mine.gapUp, 6001);
  assert.deepEqual(t.members, [{ nick: '철수', meters: 25000 }]);

  const avg = await board({ week, by: 'avg', crewId: c.crewId }) as any;
  assert.equal(avg.top[0].name, '새벽런', '1인 평균은 25km vs 15.5km');
  assert.equal(avg.mine.rank, 1);
});

test('★ 같은 주 보고는 누적 합이라 몇 번 와도 두 번 안 센다', async () => {
  const a = await createCrew({ name: '남산런', memberId: 'devD0000001', nick: '하나' }) as any;
  for (let i = 0; i < 3; i++) await reportWeek({ crewId: a.crewId, memberId: 'devD0000001', token: a.token, week, meters: 5000 });
  const r = await reportWeek({ crewId: a.crewId, memberId: 'devD0000001', token: a.token, week, meters: 8000 }) as any;
  assert.equal(r.crewTotal, 8000);
});

test('★ 남의 기기id 로 거리를 써 넣지 못한다 — 열쇠', async () => {
  const a = await createCrew({ name: '도용시험', memberId: 'devE0000001', nick: '진짜' }) as any;
  const r = await reportWeek({ crewId: a.crewId, memberId: 'devE0000001', token: 'deadbeef', week, meters: 99000 }) as any;
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test('★ 크루를 옮기면 그 주 거리도 옮겨 간다 — 두 크루에 두 번 세지 않는다', async () => {
  const x = await createCrew({ name: '옛크루', memberId: 'devF0000001', nick: '이사' }) as any;
  await reportWeek({ crewId: x.crewId, memberId: 'devF0000001', token: x.token, week, meters: 12000 });
  const y = await createCrew({ name: '새크루', memberId: 'devG0000001', nick: '주인' }) as any;
  const moved = await joinCrew({ code: y.code, memberId: 'devF0000001', nick: '이사' }) as any;
  assert.equal(moved.crewId, y.crewId);
  const old = await reportWeek({ crewId: x.crewId, memberId: 'devF0000001', token: x.token, week, meters: 12000 }) as any;
  assert.equal(old.ok, false, '옛 크루에는 더 못 쓴다');
  const t = await board({ week, crewId: x.crewId }) as any;
  assert.equal(t.mine.rank, null, '옛 크루 합에서 빠졌다');
});

test('지난 시즌은 고치지 않는다 — 이번 주·지난주만', async () => {
  const a = await createCrew({ name: '과거런', memberId: 'devH0000001', nick: '시간' }) as any;
  const r = await reportWeek({ crewId: a.crewId, memberId: 'devH0000001', token: a.token, week: '2020-W01', meters: 1000 }) as any;
  assert.equal(r.status, 422);
});

test('test- 기기는 아무것도 저장하지 않는다 — 프로덕션 스모크 격리', async () => {
  const before = kv.size;
  const r = await createCrew({ name: '스모크', memberId: 'test-smoke-1', nick: '시험' }) as any;
  assert.equal(r.test, true);
  assert.equal(kv.size, before);
});
