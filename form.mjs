// Team form (last 5 results) from football-data.org's free plan: 12 competitions, 10 requests per minute.
// One call per competition, at most once a day. Optional: skipped quietly when FOOTBALL_DATA_KEY is not set.
import fs from 'node:fs';
const BASE = process.env.FD_BASE || 'https://api.football-data.org/v4';
const CODES = (process.env.FORM_COMPETITIONS || 'PL,PD,SA,BL1,FL1,DED,PPL,ELC,CL').split(',');
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'the', 'club', 'de', 'sk', 'fk', 'cd', 'ud', 'ca', 'fa']);
const key = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).sort().join(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = process.env.DATA_DIR || 'data';
const read = () => { try { return JSON.parse(fs.readFileSync(`${DATA_DIR}/form.json`, 'utf8')); } catch { return null; } };

export async function updateForm() {
  const token = process.env.FOOTBALL_DATA_KEY;
  if (!token) return console.log('Form: no FOOTBALL_DATA_KEY set, skipped');
  const cur = read();
  if (cur && Date.now() - cur.t < 20 * 36e5) return console.log('Form: still fresh, skipped');
  const teams = { ...(cur?.teams || {}) };
  let got = 0;
  for (const code of CODES) {
    try {
      const r = await fetch(`${BASE}/competitions/${code}/standings`, { headers: { 'X-Auth-Token': token }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) { console.error('Form: HTTP', r.status, code); await sleep(7000); continue; }
      const j = await r.json();
      for (const s of j.standings || []) if (s.type === 'TOTAL') for (const row of s.table || []) {
        const f = String(row.form || '').replace(/[^WDL]/g, '').slice(-5);
        if (f.length >= 3) { teams[key(row.team?.name)] = f; if (row.team?.shortName) teams[key(row.team.shortName)] = f; got++; }
      }
    } catch (e) { console.error('Form: failed for', code, e.message); }
    await sleep(7000);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(`${DATA_DIR}/form.json`, JSON.stringify({ t: Date.now(), teams }));
  console.log('Form: updated', got, 'team rows from', CODES.length, 'competitions');
}

// Attach form only when the two names are the same after removing words like FC; wrong guesses are worse than none.
export function attachForm(days) {
  const f = read()?.teams || {};
  let n = 0;
  for (const v of Object.values(days)) for (const m of v.matches) {
    delete m.fh; delete m.fa;
    if (!m.o) continue;
    const h = f[key(m.h)], a = f[key(m.a)];
    if (h) { m.fh = h; n++; } if (a) { m.fa = a; n++; }
  }
  console.log('Form: attached to', n, 'teams');
}
