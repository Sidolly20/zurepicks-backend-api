// Optional extra odds source: Bzzoiro Sports Data (BSD), free football API.
// Rules: only fills markets that are still missing, never overwrites API-Football data,
// never throws (generate.mjs also wraps it), and logs one summary line per run.
const BASE = 'https://sports.bzzoiro.com/api/v2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'the', 'club', 'de', 'sk', 'fk', 'cd', 'ud', 'ca', 'fa']);
const toks = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w));
const pre = (a, b) => a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a));
const TAG = /^(u\d\d|ii|iii|b|w|women|reserves|youth)$/;
export function sim(a, b) {
  const A = toks(a), B = toks(b);
  if (!A.length || !B.length) return 0;
  const ta = A.filter((w) => TAG.test(w)).sort().join(), tb = B.filter((w) => TAG.test(w)).sort().join();
  if (ta !== tb) return 0; // U21 / women / reserve sides must match exactly
  return A.filter((w) => B.some((x) => x === w || pre(x, w))).length / Math.min(A.length, B.length);
}
const nm = (t) => (t && typeof t === 'object' ? t.name : t);
const when = (e) => Date.parse(e.event_date || e.date || e.kickoff || '');

async function get(path, key, st) {
  for (let i = 0; i < 2; i++) {
    st.calls++;
    const r = await fetch(BASE + path, { headers: { Authorization: 'Token ' + key }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429 && i === 0) { await sleep(Math.min(+r.headers.get('retry-after') || 5, 30) * 1000); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
    return r.json();
  }
}
async function listEvents(key, from, to, st) {
  const out = [];
  for (let off = 0; off < 2000; off += 200) {
    const j = await get(`/events/?status=upcoming&date_from=${from}&date_to=${to}&limit=200&offset=${off}`, key, st);
    const rows = Array.isArray(j) ? j : j.results || [];
    out.push(...rows);
    if (rows.length < 200) break;
  }
  return out;
}
const pair = (...v) => (v.every((n) => Number(n) > 1) ? v.map(Number) : null);
export function mapOdds(o = {}) {
  const r = {};
  const x = pair(o.home_win, o.draw, o.away_win); if (x) r.o = x;
  const u = pair(o.over_25_goals, o.under_25_goals); if (u) r.ou = u;
  const w = pair(o.over_15_goals, o.under_15_goals); if (w) r.o15 = w;
  const b = pair(o.btts_yes, o.btts_no); if (b) r.bt = b;
  return r;
}

export async function bsdFill(days, today) {
  const key = process.env.BZZOIRO_KEY;
  if (!key) return console.log('BSD: no key set, skipped');
  const st = { calls: 0 }, MAX = +process.env.BSD_MAX_CALLS || 250;
  const utc = (o) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);
  const events = await listEvents(key, utc(-1), utc(4), st);
  const ours = Object.keys(days).filter((d) => d >= today).flatMap((d) => days[d].matches)
    .filter((m) => m.st === 'NS' && !(m.o && m.ou && m.o15 && m.bt));
  const used = new Set(), todo = [];
  for (const m of ours) {
    const t = Date.parse(m.d); let best = null, bs = 0;
    for (const e of events) {
      if (used.has(e.id) || !(Math.abs(when(e) - t) <= 30 * 6e4)) continue;
      const a = sim(m.h, nm(e.home_team)), b = sim(m.a, nm(e.away_team)), s = a + b;
      if ((Math.min(a, b) >= 0.5 || Math.max(a, b) >= 1) && s > bs) { best = e; bs = s; }
    }
    if (best) { used.add(best.id); todo.push([m, best]); }
  }
  todo.sort((p, q) => !!p[0].o - !!q[0].o);
  for (const [m, e] of todo.slice(0, 5)) console.log('BSD pair:', m.h, 'v', m.a, '<->', nm(e.home_team), 'v', nm(e.away_team));
  let filled = 0;
  for (const [m, e] of todo) {
    if (st.calls >= MAX) break;
    try {
      const j = await get(`/events/${e.id}/odds/`, key, st), add = mapOdds(j.odds);
      let n = 0; for (const k in add) if (!m[k]) { m[k] = add[k]; n++; }
      if (n) filled++;
    } catch (err) { console.error('BSD odds failed for', e.id, err.message); }
    await sleep(120);
  }
  console.log(`BSD: ${events.length} events listed, ${todo.length} matched, ${filled} matches filled, ${st.calls} calls`);
}
