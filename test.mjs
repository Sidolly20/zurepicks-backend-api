import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeLive, mapStatus } from './live.mjs';
const snap = [{ id: 'bsd:1', bid: 1, d: '2026-10-31T15:00:00Z', h: 'Arsenal FC', a: 'Chelsea', st: '1H', el: 19, sc: [0, 0] }, { id: 'bsd:2', d: '2026-10-31T15:00:00Z', h: 'Real Madrid', a: 'Getafe', st: 'NS' }, { id: 'bsd:3', bid: 3, d: '2026-10-31T12:00:00Z', h: 'A', a: 'B', st: 'FT', sc: [1, 0] }];
const ev = (o) => ({ event_date: '2026-10-31T15:00:00Z', ...o });
test('score and minute move forward by id', () => { const r = mergeLive(snap, [ev({ id: 1, status: 'inprogress', period: '2H', current_minute: 71, home_score: 2, away_score: 1, home_team: 'Arsenal', away_team: 'Chelsea' })]); assert.equal(r.matches[0].el, 71); assert.deepEqual(r.matches[0].sc, [2, 1]); assert.equal(r.changed, 1); });
test('a stuck game gets its final result', () => { const r = mergeLive(snap, [ev({ id: 1, status: 'finished', home_score: 3, away_score: 1, home_team: 'Arsenal', away_team: 'Chelsea' })]); assert.equal(r.matches[0].st, 'FT'); assert.deepEqual(r.matches[0].sc, [3, 1]); });
test('matches by team names when there is no id', () => { const r = mergeLive(snap, [ev({ id: 99, status: 'inprogress', period: '1H', current_minute: 5, home_score: 0, away_score: 0, home_team: 'Real Madrid CF', away_team: 'Getafe CF' })]); assert.equal(r.matches[1].st, '1H'); assert.equal(r.matches[1].el, 5); });
test('never moves a finished game backwards', () => { const r = mergeLive(snap, [ev({ id: 3, status: 'inprogress', period: '1H', current_minute: 4, home_score: 0, away_score: 0, home_team: 'A', away_team: 'B' })]); assert.equal(r.matches[2].st, 'FT'); });
test('status words', () => { assert.equal(mapStatus({ status: 'Finished' }), 'FT'); assert.equal(mapStatus({ status: 'Halftime' }), 'HT'); assert.equal(mapStatus({ status: 'notstarted' }), 'NS'); });

import { dueJobs, tick, state, clock } from './scheduler.mjs';
const at = (iso) => new Date(iso); // WAT = UTC+1
test('jobs are due at the right Lagos times', () => {
  assert.deepEqual(dueJobs(at('2026-10-31T06:29:00Z')).map((j) => j.id), []);
  assert.deepEqual(dueJobs(at('2026-10-31T06:31:00Z')).map((j) => j.id), ['slips']);
  assert.deepEqual(dueJobs(at('2026-10-31T06:50:00Z')).map((j) => j.id).sort(), ['potd', 'slips']);
  assert.deepEqual(dueJobs(at('2026-10-31T21:31:00Z')).map((j) => j.id), ['recap']);
  assert.ok(dueJobs(at('2026-11-02T07:01:00Z')).some((j) => j.id == 'weekly')); // Monday 08:01 WAT
  assert.ok(!dueJobs(at('2026-11-03T07:01:00Z')).some((j) => j.id == 'weekly')); // Tuesday: no weekly
  assert.deepEqual(dueJobs(at('2026-10-31T08:00:00Z')).map((j) => j.id), []); // a missed post is dropped after 45 minutes
});
test('each post is sent once a day and retried until it has content', async () => {
  state.sent = {}; const sent = []; let ready = false;
  const deps = { send: async (t) => sent.push(t), build: async (id) => (ready ? 'msg ' + id : null) };
  assert.deepEqual(await tick(at('2026-10-31T06:32:00Z'), deps), []); // nothing yet, retry later
  ready = true;
  assert.deepEqual(await tick(at('2026-10-31T06:33:00Z'), deps), ['slips']);
  assert.deepEqual(await tick(at('2026-10-31T06:34:00Z'), deps), []); // already sent
  assert.equal(sent.length, 1);
  assert.deepEqual(await tick(at('2026-11-01T06:35:00Z'), deps), ['slips']); // next day sends again
});
