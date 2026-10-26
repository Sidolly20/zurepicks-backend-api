import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
fs.mkdirSync(DATA, { recursive: true });
// Seed an empty persistent data directory with the snapshots shipped in this package.
try { if (fs.readdirSync(DATA).length === 0) fs.cpSync(path.join(ROOT, 'data'), DATA, { recursive: true }); } catch {}
const PORT = Number(process.env.PORT || 10000);
const TZ = process.env.TZ_NAME || 'Africa/Lagos';
const allowedOrigins = (process.env.CORS_ORIGINS || '*').split(',').map(x => x.trim()).filter(Boolean);
let refreshRunning = false;
let refreshStartedAt = null;
let lastRefreshLog = '';
const rate = new Map();

const send = (res, status, data, headers = {}) => {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
};
const dateInTZ = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const readJSON = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const dataFor = date => validDate(date) ? readJSON(path.join(DATA, `${date}.json`)) : null;
const history = () => readJSON(path.join(DATA, 'history.json')) || readJSON(path.join(ROOT, 'history.json')) || {};
const originAllowed = origin => !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin);

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function rateLimit(req, res) {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now(); let r = rate.get(key);
  if (!r || now - r.start > 60000) r = { start: now, count: 0 };
  r.count++; rate.set(key, r);
  if (rate.size > 2000) for (const [k, v] of rate) if (now - v.start > 120000) rate.delete(k);
  if (r.count > 180) { send(res, 429, { error: 'Rate limit exceeded. Try again in a minute.' }); return false; }
  return true;
}
function normalized(odds) {
  if (!Array.isArray(odds) || odds.length < 2 || odds.some(x => !Number.isFinite(Number(x)) || Number(x) <= 1)) return null;
  const inv = odds.map(x => 1 / Number(x)); const total = inv.reduce((a, b) => a + b, 0);
  return inv.map(x => x / total);
}
function makePicks(m) {
  const markets = { '1x2': m.o, 'double-chance': m.dc, 'over-under-2.5': m.ou, 'over-under-1.5': m.o15, 'both-teams-score': m.bt };
  const out = {};
  for (const [market, odds] of Object.entries(markets)) {
    const probabilities = normalized(odds);
    if (!probabilities) continue;
    const index = probabilities.indexOf(Math.max(...probabilities));
    const labels = { '1x2': ['Home win', 'Draw', 'Away win'], 'double-chance': ['Home or draw', 'Home or away', 'Draw or away'], 'over-under-2.5': ['Over 2.5 goals', 'Under 2.5 goals'], 'over-under-1.5': ['Over 1.5 goals', 'Under 1.5 goals'], 'both-teams-score': ['Yes', 'No'] }[market];
    out[market] = { selection: labels[index], index, probability: Math.round(probabilities[index] * 100), decimalOdds: Number(odds[index]), probabilities: probabilities.map(x => Math.round(x * 1000) / 10), method: 'bookmaker-odds-normalized' };
  }
  return out;
}
function allDataDates() {
  try { return fs.readdirSync(DATA).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).map(f => f.slice(0, 10)).sort(); }
  catch { return []; }
}
function buildStats() {
  const dates = allDataDates();
  let matches = 0, withOdds = 0, finished = 0;
  for (const d of dates) {
    const j = dataFor(d); for (const m of j?.matches || []) {
      matches++; if (m.o || m.ou || m.o15 || m.bt) withOdds++;
      if (['FT','AET','PEN'].includes(m.st)) finished++;
    }
  }
  const today = dataFor(dateInTZ(0));
  const liveToday = (today?.matches || []).filter(m => ['1H','HT','2H','ET','BT','P','LIVE','INT'].includes(m.st)).length;
  return { timezone: TZ, datesAvailable: dates, matchesInSnapshots: matches, matchesWithOdds: withOdds, liveInTodaySnapshot: liveToday, finishedInSnapshots: finished, latestSnapshotUpdatedAt: dates.map(d => dataFor(d)?.updated).filter(Boolean).sort().at(-1) || null };
}
function startRefresh() {
  if (refreshRunning || !process.env.API_FOOTBALL_KEY) return false;
  refreshRunning = true; refreshStartedAt = new Date().toISOString(); lastRefreshLog = '';
  const child = spawn(process.execPath, ['generate.mjs'], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => { lastRefreshLog = (lastRefreshLog + b.toString()).slice(-12000); });
  child.stderr.on('data', b => { lastRefreshLog = (lastRefreshLog + b.toString()).slice(-12000); });
  child.on('error', e => { lastRefreshLog += `\n${e.message}`; refreshRunning = false; });
  child.on('close', code => { refreshRunning = false; lastRefreshLog += `\nRefresh process exited with code ${code}`; });
  return true;
}
function refresh(req, res) {
  const secret = process.env.REFRESH_TOKEN;
  if (!secret) return send(res, 503, { error: 'Refresh is disabled: configure REFRESH_TOKEN in the backend environment.' });
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${secret}`) return send(res, 401, { error: 'Unauthorized.' });
  if (!process.env.API_FOOTBALL_KEY) return send(res, 503, { error: 'Configure API_FOOTBALL_KEY before refreshing live data.' });
  if (refreshRunning) return send(res, 202, { status: 'already_running', startedAt: refreshStartedAt });
  startRefresh();
  return send(res, 202, { status: 'started', startedAt: refreshStartedAt, message: 'Data refresh started. Check /api/refresh-status for progress.' });
}

const server = http.createServer((req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (!originAllowed(req.headers.origin)) return send(res, 403, { error: 'Origin not allowed.' });
  if (!rateLimit(req, res)) return;
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, service: 'zurepicks-api', version: '1.0.0', now: new Date().toISOString(), refreshRunning, ...buildStats() });
  if (req.method === 'GET' && p === '/api/matches') {
    const date = url.searchParams.get('date') || dateInTZ(0); const j = dataFor(date);
    if (!j) return send(res, 404, { error: 'No match snapshot for this date.', date, availableDates: allDataDates() });
    const matches = (j.matches || []).map(m => ({ ...m, predictions: makePicks(m) }));
    return send(res, 200, { date: j.date || date, updated: j.updated || null, timezone: TZ, count: matches.length, matches });
  }
  if (req.method === 'GET' && p === '/api/matches/range') {
    const from = url.searchParams.get('from') || dateInTZ(0), to = url.searchParams.get('to') || dateInTZ(1);
    if (!validDate(from) || !validDate(to) || from > to) return send(res, 400, { error: 'Use valid from/to dates in YYYY-MM-DD format.' });
    const days = allDataDates().filter(d => d >= from && d <= to).map(date => { const j = dataFor(date); return { date, updated: j?.updated || null, matches: (j?.matches || []).map(m => ({ ...m, predictions: makePicks(m) })) }; });
    return send(res, 200, { from, to, timezone: TZ, days, count: days.reduce((n, d) => n + d.matches.length, 0) });
  }
  if (req.method === 'GET' && p === '/api/predictions') {
    const date = url.searchParams.get('date') || dateInTZ(0), j = dataFor(date);
    if (!j) return send(res, 404, { error: 'No match snapshot for this date.', date });
    const matches = (j.matches || []).map(m => ({ fixtureId: m.id, date: m.d, league: m.lg, home: m.h, away: m.a, status: m.st, score: m.sc, predictions: makePicks(m) }));
    return send(res, 200, { date, updated: j.updated || null, count: matches.length, matches });
  }
  if (req.method === 'GET' && p === '/api/history') return send(res, 200, { history: history() });
  if (req.method === 'GET' && p === '/api/track-record') {
    const h = history(), marketStats = {};
    for (const row of Object.values(h)) for (const [market, value] of Object.entries(row.p || {})) {
      if (!Array.isArray(value) || value.length < 4) continue;
      const s = marketStats[market] ||= { settled: 0, won: 0, lost: 0 };
      s.settled++; value[3] ? s.won++ : s.lost++;
    }
    for (const s of Object.values(marketStats)) s.winRate = s.settled ? Math.round(s.won / s.settled * 1000) / 10 : null;
    return send(res, 200, { markets: marketStats, historyDays: Object.keys(h).length });
  }
  if (req.method === 'GET' && p === '/api/refresh-status') return send(res, 200, { running: refreshRunning, startedAt: refreshStartedAt, log: lastRefreshLog });
  if (req.method === 'POST' && p === '/api/refresh') return refresh(req, res);
  if (p === '/api' || p.startsWith('/api/')) return send(res, 404, { error: 'API route not found.', routes: ['GET /api/health', 'GET /api/matches?date=YYYY-MM-DD', 'GET /api/matches/range?from=YYYY-MM-DD&to=YYYY-MM-DD', 'GET /api/predictions?date=YYYY-MM-DD', 'GET /api/history', 'GET /api/track-record', 'POST /api/refresh', 'GET /api/refresh-status'] });
  return send(res, 404, { error: 'Not found. This service only exposes the API.' });
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`ZurePicks API listening on ${PORT}`);
  const hours = Number(process.env.AUTO_REFRESH_HOURS ?? 6);
  if (process.env.API_FOOTBALL_KEY && Number.isFinite(hours) && hours > 0) {
    console.log(`Automatic provider refresh enabled every ${hours} hours.`);
    setTimeout(() => { if (!refreshRunning) startRefresh(); }, 30000).unref?.();
    setInterval(() => { if (!refreshRunning) startRefresh(); }, hours * 3600000).unref?.();
  } else console.log('Automatic refresh disabled (no API_FOOTBALL_KEY or AUTO_REFRESH_HOURS=0).');
});
