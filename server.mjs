// ZurePicks API: serves each day's games with LIVE scores laid over the site's saved data, and keeps time for the Telegram posts.
import express from 'express';
import cors from 'cors';
import { mapStatus, rank } from './live.mjs';
import { matchesFor, liveNow, store, dayAt } from './core.mjs';
import { startScheduler, state, JOBS } from './scheduler.mjs';

const PORT = process.env.PORT || 3000, app = express(); app.use(cors());
const age = (k) => { const e = store.get(k); return { ageSec: e?.t ? Math.round((Date.now() - e.t) / 1000) : null, error: e?.err || null }; };

app.get('/api/health', (req, res) => res.json({ status: 'healthy', uptimeSec: Math.round(process.uptime()), live: age('live'), finished: age('fin'),
  telegram: { configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID), jobs: JOBS.map((j) => j.id + ' ' + String(j.h).padStart(2, '0') + ':' + String(j.m).padStart(2, '0')), sentToday: Object.keys(state.sent).filter((k) => k.endsWith(dayAt(Date.now()))), lastRun: state.lastRun },
  dataRefresh: { configured: !!process.env.GITHUB_TOKEN, last: state.lastDispatch, error: state.dispatchError }, timestamp: new Date() }));

app.get('/api/matches', async (req, res) => {
  const date = /^\d{4}-\d\d-\d\d$/.test(req.query.date || '') ? req.query.date : dayAt(Date.now());
  res.set('Cache-Control', 'public, max-age=10'); res.json(await matchesFor(date));
});

app.get('/api/live', async (req, res) => {
  const l = await liveNow(); res.set('Cache-Control', 'public, max-age=10');
  res.json({ updated: l.t ? new Date(l.t).toISOString() : null, error: l.err, live: (l.v || []).filter((e) => rank(mapStatus(e)) == 2).map((e) => ({ id: e.id, home: e.home_team, away: e.away_team, score: [e.home_score, e.away_score], minute: e.current_minute, status: mapStatus(e) })) });
});

app.use(['/api/ai-chat'], (req, res) => res.status(410).json({ error: 'Retired. Use the AI Picker on the website.' }));
app.use((req, res) => res.status(404).json({ error: 'API route not found.' }));
app.listen(PORT, () => { console.log('ZurePicks live API on port ' + PORT); liveNow(); startScheduler(); });
