// node --test scripts/crew/crew-core.test.ts   (Node 24 는 타입을 벗겨 바로 돌린다)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptableWeeks, cleanCrewName, cleanMeters, cleanMemberId, cleanNick, gapToNext, isoWeekKST,
  makeCode, normalizeCode, rankCrews, CODE_ALPHABET,
} from '../../src/lib/crew-core.ts';

test('주는 한국 시각 월요일 0시에 바뀐다', () => {
  // 2026-10-18(일) 23:59 KST = 14:59 UTC → W42, 2026-10-19(월) 00:00 KST = 10-18 15:00 UTC → W43
  assert.equal(isoWeekKST(new Date('2026-10-18T14:59:00Z')), '2026-W42');
  assert.equal(isoWeekKST(new Date('2026-10-18T15:00:00Z')), '2026-W43');
});

test('해 경계 — ISO 주는 목요일이 속한 해', () => {
  assert.equal(isoWeekKST(new Date('2026-12-31T03:00:00Z')), '2026-W53');
  assert.equal(isoWeekKST(new Date('2027-01-04T03:00:00Z')), '2027-W01');
});

test('받아 주는 주는 이번 주와 지난주만', () => {
  const w = acceptableWeeks(new Date('2026-10-19T00:30:00Z')); // 월 09:30 KST
  assert.deepEqual(w, ['2026-W43', '2026-W42']);
});

test('거리 상한 — 주 400km 넘으면 받지 않는다', () => {
  assert.equal(cleanMeters(42195), 42195);
  assert.equal(cleanMeters('1000.4'), 1000);
  assert.equal(cleanMeters(400_001), null);
  assert.equal(cleanMeters(-1), null);
  assert.equal(cleanMeters('abc'), null);
});

test('닉네임·크루 이름에 연락처·주소를 못 흘린다', () => {
  assert.equal(cleanNick('러닝민수'), '러닝민수');
  assert.equal(cleanNick('010-1234-5678'), null);
  assert.equal(cleanNick('kakao.com/abc'), null);
  assert.equal(cleanNick(''), null);
  assert.equal(cleanNick('가'.repeat(17)), null);
  assert.equal(cleanCrewName('한강런'), '한강런');
  assert.equal(cleanCrewName('a'), null);
});

test('초대 코드 — 헷갈리는 글자 없음, 대소문자·하이픈 관대', () => {
  const c = makeCode(new Uint8Array([0, 5, 9, 200, 255, 31]));
  assert.equal(c.length, 6);
  assert.ok([...c].every((x) => CODE_ALPHABET.includes(x)));
  assert.ok(!/[01OIL]/.test(CODE_ALPHABET));
  assert.equal(normalizeCode(' ab-c23 x'.replace(' x', 'D')), 'ABC23D');
  assert.equal(normalizeCode('ABC0EF'), null, '0 은 쓰지 않는 글자');
});

test('기기 id 꼴', () => {
  assert.equal(cleanMemberId('a1b2c3d4e5f6'), 'a1b2c3d4e5f6');
  assert.equal(cleanMemberId('short'), null);
  assert.equal(cleanMemberId('bad id!'), null);
});

const rows = [
  { id: 'a', name: '한강런', total: 120_000, active: 10 },
  { id: 'b', name: '남산런', total: 80_000, active: 2 },
  { id: 'c', name: '새벽런', total: 80_000, active: 4 },
  { id: 'd', name: '유령런', total: 0, active: 0 },
];

test('★ 총거리 순위 — 같은 거리면 같은 등수, 0m 크루는 뺀다', () => {
  const r = rankCrews(rows, 'total');
  assert.deepEqual(r.map((x) => [x.name, x.rank]), [['한강런', 1], ['남산런', 2], ['새벽런', 2]]);
});

test('★ 1인 평균 순위 — 사람 많은 크루만 이기지 않는다', () => {
  const r = rankCrews(rows, 'avg');
  assert.equal(r[0].name, '남산런'); // 2명이 80km = 40km/인
  assert.equal(r[0].avg, 40_000);
});

test('한 계단 오르려면 — 위 크루보다 1m 더', () => {
  const r = rankCrews(rows, 'total');
  assert.equal(gapToNext(r, 'b'), 40_001);
  assert.equal(gapToNext(r, 'a'), null, '1등');
  assert.equal(gapToNext(r, 'c'), 40_001, '같은 등수 크루는 건너뛰고 그 위');
});
