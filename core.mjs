// Shared data access: the day's games (site snapshot + live scores) with caching.
import { bsdList, mergeLive } from './live.mjs';
export const TZ = process.env.TZ_NAME || 'Africa/Lagos';
export const SITE = (process.env.SITE_DATA_BASE || 'https://sidolly20.github.io/zurepick-site/data').replace(/\/$/, '');
const LIVE_TTL = +process.env.LIVE_TTL_MS || 20000, FIN_TTL = +process.env.FINISHED_TTL_MS || 60000, SNAP_TTL = +process.env.SNAPSHOT_TTL_MS || 120000;
export const dayAt = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(t);
const utc = (o) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);

// One shared fetch per cache key at a time; if the source fails, keep serving the last good answer.
export const store = new Map();
export async function cached(key, ttl, fn) {
  const e = store.get(key) || { t: 0, v: null, p: null, err: null }; store.set(key, e);
  if (e.v && Date.now() - e.t < ttl) return e;
  e.p ??= fn().then((v) => { e.v = v; e.t = Date.now(); e.err = null; }).catch((x) => { e.err = x.message; }).finally(() => { e.p = null; });
  await e.p; return e;
}
const getJson = async (name) => { const r = await fetch(`${SITE}/${name}?_=${Math.floor(Date.now() / SNAP_TTL)}`, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(name + ' ' + r.status); return r.json(); };
export const snapshot = (d) => cached('snap:' + d, SNAP_TTL, () => getJson(d + '.json'));
export const dataJson = async (name) => (await cached('json:' + name, SNAP_TTL, () => getJson(name))).v;
export const liveNow = () => cached('live', LIVE_TTL, () => bsdList(utc(-1), utc(1), 'live'));
export const finished = () => cached('fin', FIN_TTL, () => bsdList(utc(-1), utc(0), 'finished'));

export async function matchesFor(date) {
  const [s, l, f] = await Promise.all([snapshot(date), liveNow(), finished()]);
  if (!s.v) return { date, matches: [], source: 'none', error: s.err };
  const events = [...(l.v || []), ...(f.v || [])], liveOk = !!(l.v || f.v);
  const { matches } = events.length ? mergeLive(s.v.matches || [], events) : { matches: s.v.matches || [] };
  return { ...s.v, matches, source: liveOk ? 'live' : 'snapshot', liveUpdated: liveOk ? new Date(Math.max(l.t, f.t)).toISOString() : s.v.updated, liveError: l.err || f.err || null };
}
