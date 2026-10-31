// ZurePicks API: serves each day's games with LIVE scores laid over the site's saved data.
// Odds and picks come from the site's data files; scores, minutes and final results come live from Bzzoiro.
import express from 'express';
import cors from 'cors';
import { bsdList, mergeLive, mapStatus, rank } from './live.mjs';

const PORT = process.env.PORT || 3000, TZ = process.env.TZ_NAME || 'Africa/Lagos';
const SITE = (process.env.SITE_DATA_BASE || 'https://sidolly20.github.io/zurepick-site/data').replace(/\/$/, '');
const LIVE_TTL = +process.env.LIVE_TTL_MS || 20000, FIN_TTL = +process.env.FINISHED_TTL_MS || 60000, SNAP_TTL = +process.env.SNAPSHOT_TTL_MS || 120000;
const app = express(); app.use(cors());
const dayAt = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(t), utc = (o) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);

// One shared fetch per cache key at a time; if the source fails, keep serving the last good answer.
const store = new Map();
async function cached(key, ttl, fn) {
  const e = store.get(key) || { t: 0, v: null, p: null, err: null }; store.set(key, e);
  if (e.v && Date.now() - e.t < ttl) return e;
  e.p ??= fn().then((v) => { e.v = v; e.t = Date.now(); e.err = null; }).catch((x) => { e.err = x.message; }).finally(() => { e.p = null; });
  await e.p; return e;
}
const snapshot = (d) => cached('snap:' + d, SNAP_TTL, async () => { const r = await fetch(`${SITE}/${d}.json?_=${Math.floor(Date.now() / SNAP_TTL)}`, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('snapshot ' + r.status); return r.json(); });
const liveNow = () => cached('live', LIVE_TTL, () => bsdList(utc(-1), utc(1), 'live'));
const finished = () => cached('fin', FIN_TTL, () => bsdList(utc(-1), utc(0), 'finished'));

app.get('/api/health', (req, res) => {
  const l = store.get('live'), f = store.get('fin');
  res.json({ status: 'healthy', uptimeSec: Math.round(process.uptime()), live: { ageSec: l?.t ? Math.round((Date.now() - l.t) / 1000) : null, error: l?.err || null }, finished: { ageSec: f?.t ? Math.round((Date.now() - f.t) / 1000) : null, error: f?.err || null }, timestamp: new Date() });
});

app.get('/api/matches', async (req, res) => {
  const date = /^\d{4}-\d\d-\d\d$/.test(req.query.date || '') ? req.query.date : dayAt(Date.now());
  const [s, l, f] = await Promise.all([snapshot(date), liveNow(), finished()]);
  if (!s.v) return res.json({ date, matches: [], source: 'none', error: s.err });
  const events = [...(l.v || []), ...(f.v || [])], liveOk = !!(l.v || f.v);
  const { matches } = events.length ? mergeLive(s.v.matches || [], events) : { matches: s.v.matches || [] };
  res.set('Cache-Control', 'public, max-age=10');
  res.json({ ...s.v, matches, source: liveOk ? 'live' : 'snapshot', liveUpdated: liveOk ? new Date(Math.max(l.t, f.t)).toISOString() : s.v.updated, liveError: l.err || f.err || null });
});

// Compact list of games in play right now.
app.get('/api/live', async (req, res) => {
  const l = await liveNow();
  res.set('Cache-Control', 'public, max-age=10');
  res.json({ updated: l.t ? new Date(l.t).toISOString() : null, error: l.err, live: (l.v || []).filter((e) => rank(mapStatus(e)) == 2).map((e) => ({ id: e.id, home: e.home_team, away: e.away_team, score: [e.home_score, e.away_score], minute: e.current_minute, status: mapStatus(e) })) });
});

// The old demo "AI banker" endpoints returned made-up games and win chances, so they are retired.
app.use(['/api/ai-chat'], (req, res) => res.status(410).json({ error: 'Retired. Use the AI Picker on the website.' }));
app.use((req, res) => res.status(404).json({ error: 'API route not found.' }));
app.listen(PORT, () => { console.log('ZurePicks live API on port ' + PORT); liveNow(); finished(); });
