import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';

const port = 19000 + Math.floor(Math.random() * 1000);
let child;
const base = `http://127.0.0.1:${port}`;

 test('ZurePicks API smoke tests', async t => {
  child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), CORS_ORIGINS: '*', REFRESH_TOKEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', x => logs += x.toString());
  child.stderr.on('data', x => logs += x.toString());
  t.after(() => { if (child && child.exitCode === null) child.kill('SIGTERM'); });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(ready, true, `server did not start: ${logs}`);

  await t.test('health reports service and bundled snapshots', async () => {
    const r = await fetch(`${base}/api/health`); const j = await r.json();
    assert.equal(r.status, 200); assert.equal(j.ok, true); assert.equal(j.service, 'zurepicks-api');
    assert.ok(Array.isArray(j.datesAvailable) && j.datesAvailable.length > 0);
  });
  await t.test('match endpoint returns match and prediction data', async () => {
    const r = await fetch(`${base}/api/matches?date=${new Date().toISOString().slice(0,10)}`);
    // The system date can differ from bundled dates; check a known shipped snapshot instead.
    const response = r.status === 404 ? await fetch(`${base}/api/matches?date=2026-10-26`) : r;
    const j = await response.json();
    assert.equal(response.status, 200); assert.ok(Array.isArray(j.matches)); assert.ok(j.count >= 0);
    if (j.matches.length) assert.ok('predictions' in j.matches[0]);
  });
  await t.test('track-record endpoint returns market summary', async () => {
    const r = await fetch(`${base}/api/track-record`); const j = await r.json();
    assert.equal(r.status, 200); assert.ok(j.markets && typeof j.markets === 'object');
  });
  await t.test('unknown API routes return JSON 404', async () => {
    const r = await fetch(`${base}/api/not-a-route`); const j = await r.json();
    assert.equal(r.status, 404); assert.ok(j.error);
  });
});
