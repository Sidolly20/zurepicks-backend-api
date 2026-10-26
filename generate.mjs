// Fetches fixtures + odds from API-Football and writes data/YYYY-MM-DD.json for the static site.
// Free plan = 100 requests/day: each run stops at MAX_CALLS, big leagues get odds first, and
// progress is remembered between runs so coverage keeps growing through the day.
import fs from 'node:fs';
const KEY = process.env.API_FOOTBALL_KEY;
if (!KEY) { console.error('Missing API_FOOTBALL_KEY'); process.exit(1); }
const BASE = process.env.API_BASE || 'https://v3.football.api-sports.io';
const TZ = process.env.TZ_NAME || 'Africa/Lagos', BK = process.env.ODDS_BOOKMAKER ?? '8', MAX = +process.env.MAX_CALLS || 22;
const PRI = (process.env.PRIORITY_LEAGUES || '39,140,135,78,61,2,3,848,88,94,45,40,179').split(',').map(Number);
let calls = 0, remaining = 99;
const day = (o) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + o * 864e5));

async function api(path) {
  if (calls >= MAX || remaining < 3) return null;
  calls++;
  const r = await fetch(BASE + path, { headers: { 'x-apisports-key': KEY } });
  const rem = r.headers.get('x-ratelimit-requests-remaining'); if (rem !== null) remaining = +rem;
  if (!r.ok) { console.error('API error', r.status, path); return null; }
  const j = await r.json(), e = j.errors;
  if (e && (Array.isArray(e) ? e.length : Object.keys(e).length)) { console.error('API said:', JSON.stringify(e)); return null; }
  return j;
}

const WANT = { o: ['Match Winner', ['Home', 'Draw', 'Away']], dc: ['Double Chance', ['Home/Draw', 'Home/Away', 'Draw/Away']], ou: ['Goals Over/Under', ['Over 2.5', 'Under 2.5']], o15: ['Goals Over/Under', ['Over 1.5', 'Under 1.5']], bt: ['Both Teams Score', ['Yes', 'No']] };
function oddsOf(item) {
  const out = {};
  for (const bk of item.bookmakers || []) for (const bet of bk.bets || []) for (const [k, [name, vals]] of Object.entries(WANT)) {
    if (bet.name !== name || out[k]) continue;
    const arr = vals.map((v) => Number(bet.values.find((x) => x.value === v)?.odd));
    if (arr.every((n) => n > 1)) out[k] = arr;
  }
  return out;
}

const DATA_DIR = process.env.DATA_DIR || 'data';
fs.mkdirSync(DATA_DIR, { recursive: true });
const file = (d) => `${DATA_DIR}/${d}.json`;
const read = (d) => { try { return JSON.parse(fs.readFileSync(file(d), 'utf8')); } catch { return null; } };
const SETTLED = ['FT', 'AET', 'PEN', 'CANC', 'PST', 'ABD', 'AWD', 'WO'];
const dates = [0, 1].map(day);
if (!read(day(-1))?.matches?.length || read(day(-1)).matches.some((m) => !SETTLED.includes(m.st))) dates.unshift(day(-1));
for (const o of [2, 3, 4]) if (!read(day(o))) dates.push(day(o));

// 1) fixtures
const days = {};
for (const d of dates) {
  const fx = await api(`/fixtures?date=${d}&timezone=${encodeURIComponent(TZ)}`);
  if (!fx) continue;
  const prev = read(d), pm = new Map((prev?.matches || []).map((m) => [m.id, m]));
  const matches = (fx.response || []).map((x) => {
    const m = { id: x.fixture.id, d: x.fixture.date, li: x.league.id, se: x.league.season, lg: x.league.name, cn: x.league.country, lo: x.league.logo, h: x.teams.home.name, a: x.teams.away.name, st: x.fixture.status.short, el: x.fixture.status.elapsed, sc: [x.goals.home, x.goals.away] };
    const p = pm.get(m.id); if (p) for (const k of Object.keys(WANT)) if (p[k]) m[k] = p[k];
    return m;
  });
  days[d] = { matches, od: prev?.od || 0, op: prev?.op || 0 };
}

const missing = (d) => days[d].matches.filter((m) => m.st === 'NS' && !m.o);
async function fetchOdds(d, extra, start = 1) {
  const byId = new Map(days[d].matches.map((m) => [m.id, m]));
  for (let page = start; page < 80; page++) {
    const r = await api(`/odds?date=${d}&page=${page}&timezone=${encodeURIComponent(TZ)}${BK ? '&bookmaker=' + BK : ''}${extra}`);
    if (!r) return { page: page - 1, done: false };
    for (const item of r.response || []) { const m = byId.get(item.fixture.id); if (m && m.st === 'NS') Object.assign(m, oddsOf(item)); }
    if (!r.paging || r.paging.current >= r.paging.total) return { page, done: true };
  }
  return { page: 79, done: false };
}
const upcoming = Object.keys(days).filter((d) => d >= day(0) && d <= day(2)).sort();

// 2) big leagues first
for (const d of upcoming) for (const lid of PRI) {
  const ms = missing(d).filter((m) => m.li === lid);
  if (ms.length) await fetchOdds(d, `&league=${lid}&season=${ms[0].se}`);
}
// 3) everything else, resuming where the last run stopped
for (const d of upcoming) {
  if (!missing(d).length || Date.now() - days[d].od < 6 * 36e5) continue;
  const r = await fetchOdds(d, '', (days[d].op || 0) + 1);
  days[d].op = r.done ? 0 : r.page;
  if (r.done) days[d].od = Date.now();
}

try { const { bsdFill } = await import('./sources.mjs'); await bsdFill(days, day(0)); } catch (e) { console.error('BSD skipped:', e.message); }
try { const { updateForm, attachForm } = await import('./form.mjs'); await updateForm(); attachForm(days); } catch (e) { console.error('Form skipped:', e.message); }

for (const [d, v] of Object.entries(days)) {
  fs.writeFileSync(file(d), JSON.stringify({ date: d, updated: new Date().toISOString(), od: v.od, op: v.op, matches: v.matches }));
  console.log(d, v.matches.length, 'matches,', v.matches.filter((m) => m.o).length, 'with odds');
}
for (const f of fs.readdirSync(DATA_DIR)) if (/^\d{4}-\d\d-\d\d\.json$/.test(f) && f.slice(0, 10) < day(-10)) fs.unlinkSync(`${DATA_DIR}/${f}`);
console.log('API calls used this run:', calls);
