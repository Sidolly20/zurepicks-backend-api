// Live-score helpers: talk to Bzzoiro (BSD), map its words to our short status codes, and overlay live scores on a day snapshot.
import { sameTeam } from './teams.mjs';
const BASE = () => process.env.BSD_BASE || 'https://sports.bzzoiro.com/api/v2';
const FINAL = ['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO', 'SUSP'], LIVE = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'];
export const rank = (s) => (FINAL.includes(s) ? 3 : LIVE.includes(s) ? 2 : !s || s == 'NS' || s == 'TBD' ? 0 : 1);
const num = (n) => (n !== null && n !== undefined && n !== '' && Number.isFinite(+n) ? +n : null);

export function mapStatus(e) {
  const s = String(e.status || '').toLowerCase().replace(/[^a-z]/g, ''), p = String(e.period || '').toUpperCase();
  if (!s || ['notstarted', 'upcoming', 'scheduled', 'timed'].includes(s)) return 'NS';
  if (['finished', 'ended', 'fulltime', 'ft', 'afterextratime', 'afterpenalties'].includes(s)) return p == 'AET' || p == 'PEN' ? p : 'FT';
  if (s.includes('postpone')) return 'PST'; if (s.includes('cancel')) return 'CANC'; if (s.includes('abandon')) return 'ABD'; if (s.includes('suspend')) return 'SUSP';
  if (s.includes('interrupt')) return 'INT'; if (s.includes('halftime') || p == 'HT') return 'HT';
  if (['1H', '2H', 'ET'].includes(p)) return p;
  return 'LIVE';
}

export async function bsdList(from, to, status, { key = process.env.BZZOIRO_KEY, timeout = 8000, pages = 4 } = {}) {
  if (!key) throw new Error('BZZOIRO_KEY is not set');
  const out = [];
  for (let off = 0, i = 0; i < pages; off += 200, i++) {
    const r = await fetch(`${BASE()}/events/?status=${status}&date_from=${from}&date_to=${to}&limit=200&offset=${off}`, { headers: { Authorization: 'Token ' + key }, signal: AbortSignal.timeout(timeout) });
    if (!r.ok) throw new Error('BSD HTTP ' + r.status);
    const j = await r.json(), rows = Array.isArray(j) ? j : j?.results || [];
    out.push(...rows); if (rows.length < 200) break;
  }
  return out;
}

// Never moves a match backwards (a finished game can't become live again).
export function apply(m, e) {
  const st = mapStatus(e); if (rank(st) < rank(m.st)) return m;
  return { ...m, st, el: rank(st) >= 1 ? num(e.current_minute) ?? m.el : m.el, sc: rank(st) >= 2 ? [num(e.home_score), num(e.away_score)] : m.sc };
}

export function mergeLive(matches, events) {
  const byId = new Map(events.map((e) => [String(e.id), e]));
  let changed = 0;
  const out = matches.map((m) => {
    let e = byId.get(String(m.bid ?? '')) || byId.get(String(m.id).replace('bsd:', ''));
    if (!e) { const t = Date.parse(m.d); e = events.find((x) => Math.abs(Date.parse(x.event_date) - t) < 3 * 36e5 && sameTeam(m.h, x.home_team) && sameTeam(m.a, x.away_team)); }
    if (!e) return m;
    const n = apply(m, e); if (n !== m && JSON.stringify([n.st, n.el, n.sc]) !== JSON.stringify([m.st, m.el, m.sc])) changed++;
    return n;
  });
  return { matches: out, changed };
}
