// Shared by the build script (Node) and the browser (app.js): pure functions that turn match data into HTML.
export const TZ = 'Africa/Lagos', DONE = ['FT', 'AET', 'PEN'], LIVE = ['1H', 'HT', '2H', 'ET', 'P', 'BT', 'LIVE'];
export const PRIO = [39, 140, 135, 78, 61, 2, 3, 848, 88, 94, 45, 40, 179];
export const MK = {
  o: { l: '1X2', s: ['1', 'X', '2'], n: ['Home win', 'Draw', 'Away win'], ev: (i, h, a) => (i == 0 ? h > a : i == 1 ? h == a : a > h) },
  dc: { l: 'Double chance', s: ['1X', '12', 'X2'], n: ['Home or draw', 'Home or away', 'Draw or away'], ev: (i, h, a) => (i == 0 ? h >= a : i == 1 ? h != a : a >= h) },
  ou: { l: 'Over/Under 2.5', s: ['Over', 'Under'], n: ['Over 2.5', 'Under 2.5'], ev: (i, h, a) => (i == 0 ? h + a > 2.5 : h + a < 2.5) },
  o15: { l: 'Over/Under 1.5', s: ['Over', 'Under'], n: ['Over 1.5', 'Under 1.5'], ev: (i, h, a) => (i == 0 ? h + a > 1.5 : h + a < 1.5) },
  bt: { l: 'Both teams score', s: ['Yes', 'No'], n: ['Both score', 'Not both'], ev: (i, h, a) => (i == 0 ? h > 0 && a > 0 : !(h > 0 && a > 0)) },
};
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const hm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const norm = (od) => { const s = od.reduce((t, x) => t + 1 / x, 0); return od.map((x) => 1 / x / s); };
// Pick = the outcome the bookmaker prices as most likely (margin removed). Without odds, the team-record model (m.pm) is used.
export function pick(m, k) {
  const od = m[k]; let q, o = null;
  if (od && !od.some((x) => !(x > 1))) {
    if (k == 'dc') { if (m.o && !m.o.some((x) => !(x > 1))) { const p = norm(m.o); q = [p[0] + p[1], p[0] + p[2], p[1] + p[2]]; } } else q = norm(od);
    o = true;
  }
  if (!q && k == 'dc' && m.o && !m.o.some((x) => !(x > 1))) { const p = norm(m.o); q = [p[0] + p[1], p[0] + p[2], p[1] + p[2]]; o = 'derived'; } // no double-chance prices: derive the chance from 1X2 odds
  if (!q && m.pm && (k == 'o' || k == 'dc')) { const p = m.pm.map((x) => x / 100); q = k == 'o' ? p : [p[0] + p[1], p[0] + p[2], p[1] + p[2]]; o = false; }
  if (!q) return null;
  const i = q.indexOf(Math.max(...q)); return { i, c: Math.round(q[i] * 100), od: o === true ? od[i] : null, model: !o };
}
// Quality bar: a pick is only published when its implied chance reaches this level (own tracked results: 1X2 picks under 60% won ~45-50%, 60%+ won ~80%).
export const MIN = { o: 60, dc: 75, ou: 60, o15: 75, bt: 60 };
export function visible(ms, k, o = {}) {
  const min = o.min === undefined || o.min === '' || o.min === null ? MIN[k] : +o.min; // min 0 = show every pick
  let L = ms.filter((m) => { const p = pick(m, k); return p && p.c >= min && (!o.lg || m.li == o.lg) && (!o.match || o.match(m)); });
  if (o.q) { const q = o.q.toLowerCase(); L = L.filter((m) => (m.h + ' ' + m.a + ' ' + m.lg + ' ' + m.cn).toLowerCase().includes(q)); }
  return L;
}
export const settled = (m) => DONE.includes(m.st) && m.sc && m.sc[0] != null;
export const won = (m, k, pk) => settled(m) && MK[k].ev(pk.i, m.sc[0], m.sc[1]);
const END = ['PST', 'CANC', 'ABD', 'AWD', 'WO', 'SUSP'];
// Match state: finished / live / postponed / kicked-off-but-no-update / not started.
export function state(m, now = Date.now()) {
  const age = now - new Date(m.d).getTime(), sc = m.sc || [null, null];
  if (settled(m)) return { k: 'fin', big: sc[0] + '–' + sc[1], sm: m.st == 'FT' ? 'Full time' : m.st };
  if (END.includes(m.st)) return { k: 'pst', big: '–', sm: 'Postponed' };
  if (LIVE.includes(m.st) && age < 175 * 6e4) { const behind = m.el && m.st != 'HT' && age / 6e4 - m.el > 38; if (behind) return { k: 'ko', big: (sc[0] ?? 0) + '–' + (sc[1] ?? 0), sm: 'Updating score' }; return { k: 'live', big: (sc[0] ?? 0) + '–' + (sc[1] ?? 0), sm: m.st == 'HT' ? 'Half time' : m.el ? m.el + '′' : 'Live' }; }
  if (age > 0) return { k: 'ko', big: sc[0] != null ? sc[0] + '–' + sc[1] : '?–?', sm: age > 135 * 6e4 ? 'Awaiting result' : 'Kicked off' };
  return { k: 'ns', big: '–', sm: 'Not started' };
}
export function stats(ms, now = Date.now()) {
  let done = 0, live = 0, wait = 0; for (const m of ms) { const k = state(m, now).k; if (k == 'fin') done++; else if (k == 'live') live++; else if (k == 'ko') wait++; }
  const n = ms.length; return { n, done, live, wait, left: n - done - live - wait, pct: n ? Math.round((done / n) * 100) : 0 };
}
export function statsHtml(ms, hit, label = 'Picks today') {
  const s = stats(ms), p = (x) => (s.n ? Math.round((x / s.n) * 100) : 0);
  return `<div><b>${s.n || '–'}</b><span>${label}</span></div><div><b>${s.done}</b><span>Played · ${s.pct}%</span></div><div class="lv"><b>${s.live}</b><span>Live now</span></div>${s.wait ? `<div><b>${s.wait}</b><span>Awaiting score</span></div>` : ''}<div><b>${s.left}</b><span>Not started · ${p(s.left)}%</span></div>${hit && hit.n ? `<div><b>${hit.r}%</b><span>Won ${hit.w} of ${hit.n} · 30 days</span></div>` : ''}`;
}
import { teamKey } from './teams.js';
export let CRESTS = {}; export const setCrests = (c) => { CRESTS = c || {}; };
export let PREVIEWS = {}; export const setPreviews = (p) => { PREVIEWS = p || {}; };
const badge = (m, name) => { const ch = CRESTS[teamKey(m.h)], ca = CRESTS[teamKey(m.a)], c = CRESTS[teamKey(name)]; return !ch && !ca ? '' : c ? `<img class="bd" src="${esc(c)}" alt="" width="18" height="18" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '<i class="bd"></i>'; };
const dcFrom = (o) => [1 / (1 / o[0] + 1 / o[1]), 1 / (1 / o[0] + 1 / o[2]), 1 / (1 / o[1] + 1 / o[2])];
export function row(m, k, o = {}) {
  let pk = pick(m, k); if (o.bar && pk && pk.c < (MIN[k] ?? 60)) pk = null; // league pages list every game but only show picks that clear the quality bar
  const M = MK[k], od = m[k] || [], st = state(m);
  const w = st.k == 'fin' && pk ? (won(m, k, pk) ? ' win' : ' loss') : '';
  const eo = k == 'dc' && !od.length && m.o && !m.o.some((x) => !(x > 1)) ? dcFrom(m.o) : null;
  const cells = eo ? eo.map((x, i) => `<span class="oc est${pk && pk.i == i ? ' pick' : ''}" title="Estimated from the 1X2 odds"><small>${M.s[i]}${pk && pk.i == i ? ' · ' + pk.c + '%' : ''}</small>~${x.toFixed(2)}</span>`).join('') : (od.length ? od : M.s.map(() => null)).map((x, i) => x
    ? `<button type="button" class="oc${pk && pk.i == i ? ' pick' : ''}" data-id="${m.id}" data-i="${i}" data-od="${x}" aria-label="${esc(M.n[i])} at ${x}"><small>${M.s[i]}${pk && pk.i == i ? ' · ' + pk.c + '%' : ''}</small>${Number(x).toFixed(2)}</button>`
    : pk && pk.i == i ? `<span class="oc nil pick" title="Predicted from team form, no odds published yet"><small>${M.s[i]} · ${pk.c}%</small>pick</span>` : `<span class="oc nil"><small>${M.s[i]}</small>–</span>`).join('');
  const pkh = pk ? `<span>${esc(M.n[pk.i])}</span><i style="--w:${pk.c}%"></i><em>${pk.c}% · ${pk.model ? 'team-record model' : 'from odds'}</em>` : `<span class="mut">${od.length ? 'No strong pick' : st.k == 'ns' ? 'Odds not out yet' : 'Not tipped'}</span><i style="--w:0%"></i><em>${od.length ? 'Below our quality bar' : st.k == 'ns' ? 'Check back closer to kick-off' : 'No odds were published'}</em>`;
  return `<article class="row ${st.k}${w}" data-id="${m.id}"><time>${hm(m.d)}</time>${PREVIEWS[m.id] ? `<a class="tm" href="${esc(PREVIEWS[m.id])}" title="Match preview and prediction">` : '<div class="tm">'}<b>${badge(m, m.h)}<span>${esc(m.h)}</span></b><b>${badge(m, m.a)}<span>${esc(m.a)}</span></b>${PREVIEWS[m.id] ? '</a>' : '</div>'}<div class="ods c${M.s.length}">${cells}</div><div class="pk">${pkh}</div><div class="sb"><strong>${st.big}</strong><small>${st.sm}</small></div></article>`;
}
const lgSrc = (m) => m.lo || CRESTS['lg:' + normName(m.cn) + ':' + normName(m.lg)] || CRESTS['lg::' + normName(m.lg)] || '';
const lgLogo = (m) => { const s = lgSrc(m); return s ? `<img src="${esc(s)}" alt="" width="20" height="20" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''; };
export function board(ms, k, o = {}) {
  let L = visible(ms, k, o);
  if (o.max) L = L.slice().sort((a, b) => (pick(b, k)?.c || 0) - (pick(a, k)?.c || 0)).slice(0, o.max);
  if (!L.length) return '<div class="empty">No picks meet our quality bar for this day yet. We only publish games where the chance is strong enough, so quiet days are normal.</div>';
  const G = {}; for (const m of L) (G[m.li + '|' + m.cn + '|' + m.lg] ??= []).push(m);
  const rank = (g) => { const i = PRIO.indexOf(+g.split('|')[0]); return i < 0 ? 99 : i; };
  return Object.keys(G).sort((a, b) => rank(a) - rank(b) || G[b].length - G[a].length || a.localeCompare(b)).map((g) => {
    const [, cn, lg] = g.split('|'), x = G[g].sort((a, b) => a.d.localeCompare(b.d));
    return `<section class="lg"><h3>${lgLogo(x[0])}<span>${esc(cn)} · ${esc(lg)}</span><em>${x.length}</em></h3>${x.map((m) => row(m, k)).join('')}</section>`;
  }).join('');
}
export function topCards(ms, n = 6) {
  const L = ms.filter((m) => !settled(m) && !LIVE.includes(m.st)).map((m) => ({ m, p: pick(m, 'o') })).filter((x) => x.p && x.p.od && x.p.od >= 1.15)
    .sort((a, b) => b.p.c - a.p.c || PRIO.indexOf(a.m.li) - PRIO.indexOf(b.m.li)).slice(0, n);
  if (!L.length) return '';
  return L.map(({ m, p }) => `<div class="tc"><small>${esc(m.lg)} · ${hm(m.d)}</small><b>${esc(m.h)} v ${esc(m.a)}</b><div><span class="tag">${esc(MK.o.n[p.i])}</span><span class="mono">${p.od.toFixed(2)}</span></div><i style="--w:${p.c}%"></i><em>${p.c}% implied</em></div>`).join('');
}

// ---- Odds combos: slips whose odds multiply to about 2, 3 and 5. They are always filled: the search widens step by step when strong picks are scarce. ----
export const COMBOS = [[2, 4], [3, 5], [5, 6]]; // [target odds, most games to start with]
const CAP = 1.45; // a slip may overshoot its target by at most 45%
const LADDER = [70, 65, 60, 55, 50]; // lowest chance allowed for any single game, tried in this order
function bestCombo(C, T, maxLegs) {
  // suf[j] = odds of C[j..] from highest to lowest, used to drop paths that can no longer reach the target
  const n = C.length, suf = new Array(n + 1); suf[n] = []; for (let j = n - 1; j >= 0; j--) suf[j] = [...suf[j + 1], C[j].od].sort((a, b) => b - a);
  const ub = (j, slots) => { let p = 1; for (let t = 0; t < slots && t < suf[j].length; t++) p *= suf[j][t]; return p; };
  let best = null, nodes = 0;
  const go = (i, k, od, pr, legs) => {
    if (od >= T) { if (!best || pr > best.pr + 1e-9 || (Math.abs(pr - best.pr) < 1e-9 && od < best.od)) best = { legs: legs.slice(), od, pr }; return; }
    if (k >= maxLegs || nodes > 400000 || od * ub(i, maxLegs - k) < T) return;
    for (let j = i; j < n; j++) {
      nodes++; const o = od * C[j].od; if (o > T * CAP || o * ub(j + 1, maxLegs - k - 1) < T) continue;
      legs.push(C[j]); go(j + 1, k + 1, o, pr * C[j].p, legs); legs.pop();
    }
  };
  go(0, 0, 1, 1, []); return best;
}
export function combos(ms, now = Date.now(), dedupe = false) {
  // every odds-based pick of every game that has not started
  const games = [];
  for (const m of ms) {
    if (state(m, now).k != 'ns') continue;
    const L = []; for (const k in MK) { const p = pick(m, k); if (p && !p.model && p.od > 1.04) L.push({ m, k, i: p.i, od: p.od, c: p.c, p: p.c / 100 }); }
    if (L.length) games.push(L);
  }
  // one leg per game: its strongest pick that meets the chance and odds limits
  const pool = (minC, minOd, skip) => games.map((L) => L.filter((x) => x.c >= minC && x.od >= minOd && !skip.has(x.m.id)).sort((a, b) => b.c - a.c)[0]).filter(Boolean).sort((a, b) => b.p - a.p || b.od - a.od);
  // half the safest games, half the highest-odds ones: only safe short-odds games could never add up to 5.0
  const mix = (P, size) => { const h = Math.ceil(size / 2), hi = [...P].sort((a, b) => b.od - a.od || b.p - a.p); return [...new Set([...P.slice(0, h), ...hi.slice(0, h)])].sort((a, b) => b.p - a.p || b.od - a.od); };
  const used = new Set(), out = [];
  for (const [T, max] of COMBOS) {
    let r = null, minC = 0;
    search: for (const c of LADDER) for (const bonus of [0, 1, 2]) for (const skip of [used, new Set()]) { // prefer new games, then allow repeats
      const P = mix(pool(c, c >= 60 ? 1.15 : 1.08, skip), bonus ? 22 : 28); r = bestCombo(P, T, max + bonus);
      if (r) { minC = Math.min(...r.legs.map((x) => x.c)); break search; }
    }
    if (!r) { // last resort: stack the strongest picks until the target is reached (or all are used)
      const P = pool(0, 1.04, new Set()); let od = 1, pr = 1; const legs = [];
      for (const x of P) { if (od >= T || legs.length >= 10) break; legs.push(x); od *= x.od; pr *= x.p; }
      if (legs.length) { r = { legs, od, pr }; minC = Math.min(...legs.map((x) => x.c)); }
    }
    if (r) r.legs.forEach((x) => used.add(x.m.id));
    out.push({ target: T, legs: r ? r.legs.sort((a, b) => Date.parse(a.m.d) - Date.parse(b.m.d)) : [], od: r ? r.od : 0, chance: r ? Math.round(r.pr * 100) : 0, minC, short: !!r && r.od < T });
  }
  if (dedupe) { const seen = new Set(); return out.filter((c) => { if (!c.legs.length) return true; const key = c.legs.map((x) => x.m.id + x.k).join('|'); if (seen.has(key)) return false; seen.add(key); return true; }); }
  return out;
}
export function comboHtml(ms, now = Date.now(), opt = {}) {
  const h = comboHtmlInner(ms, now, opt); if (opt.only) return h;
  const n = (h.match(/class="cbx"/g) || []).length;
  return n && n < 3 ? h + '<p class="mut">Only this many different slips can be built from the games priced so far. More appear as odds are published, and fresh 2, 3 and 5 odds slips arrive every morning.</p>' : h;
}
function comboHtmlInner(ms, now = Date.now(), opt = {}) {
  const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(t), today = day(now), tomorrow = day(now + 864e5);
  const tag = (m) => { const d = day(Date.parse(m.d)); return d == today ? '' : d == tomorrow ? 'Tmrw' : new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric' }).format(Date.parse(m.d)); };
  return combos(ms, now, !opt.only).filter((c) => !opt.only || c.target === opt.only).map((c) => !c.legs.length
    ? `<div class="cbx empty"><div class="ch"><span>${c.target} odds</span><b>–</b></div><p>${opt.when || 'Today’s'} slip is still being prepared. It appears as soon as enough games and odds are published, so check back soon.</p></div>`
    : `<div class="cbx"><div class="ch"><span>${c.short ? 'Best available' : c.target + '+ odds'}</span><b>${c.od.toFixed(2)}</b></div><div class="cm">${c.legs.length} games · ${c.chance}% combined chance${c.minC < 65 ? ' · includes picks from ' + c.minC + '%' : ''}</div>${c.legs.map((x) => `<div class="cl"><time>${tag(x.m) ? `<small>${tag(x.m)}</small>` : ''}${hm(x.m.d)}</time><div><b>${esc(x.m.h)} v ${esc(x.m.a)}</b><small>${esc(x.m.lg)}</small></div><span class="tag">${esc(MK[x.k].n[x.i])}</span><span class="mono">${x.od.toFixed(2)}</span></div>`).join('')}${opt.share ? `<a class="cb" href="https://wa.me/?text=${encodeURIComponent(c.target + ' odds slip (' + c.od.toFixed(2) + ')\n' + c.legs.map((x) => x.m.h + ' v ' + x.m.a + ' – ' + MK[x.k].n[x.i] + ' @' + x.od.toFixed(2)).join('\n') + '\nhttps://sidolly20.github.io/zurepick-site/')}" target="_blank" rel="noopener">Share this slip on WhatsApp</a>` : `<button type="button" class="cb" data-t="${c.target}">Add ${c.legs.length} games to slip</button>`}</div>`).join('');
}

// ---- League pages: all fixtures of one league for the next days, grouped by day (with or without a pick) ----
export const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
export function leagueTest(spec) {
  const names = (spec.names || []).map(normName), cs = (spec.countries || []).map(normName);
  return (m) => m.li == spec.id || (names.includes(normName(m.lg)) && (!cs.length || cs.some((c) => normName(m.cn).includes(c))));
}
export function fixturesByDay(ms, k, match, o = {}) {
  const now = o.now || Date.now(), day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(t), today = day(now), tomorrow = day(now + 864e5);
  let L = ms.filter(match); if (o.q) { const q = o.q.toLowerCase(); L = L.filter((m) => (m.h + ' ' + m.a).toLowerCase().includes(q)); }
  const seen = new Set(); L = L.filter((m) => !seen.has(m.id) && seen.add(m.id)).sort((a, b) => Date.parse(a.d) - Date.parse(b.d));
  if (!L.length) return `<div class="empty">${esc(o.empty || 'No fixtures in the next three days. This usually means an international break or a gap between rounds.')}</div>`;
  const G = {}; for (const m of L) (G[day(Date.parse(m.d))] ??= []).push(m);
  const keys = Object.keys(G).sort(), ahead = keys.filter((d) => d >= today), past = keys.filter((d) => d < today).reverse(); // coming games first, then recent results
  const yesterday = day(now - 864e5);
  return [...ahead, ...past].map((d) => {
    const nice = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00Z'));
    const lead = d == today ? 'Today' : d == tomorrow ? 'Tomorrow' : d == yesterday ? 'Yesterday · results' : d < today ? 'Results' : nice.split(' ')[0];
    return `<section class="lg"><h3><span>${esc(lead)} · ${esc(nice)}</span><em>${G[d].length}</em></h3>${G[d].map((m) => row(m, k, { bar: true })).join('')}</section>`;
  }).join('');
}
const mono = (n) => { const w = String(n || '').split(/[^A-Za-z0-9\u00C0-\u024F]+/).filter(Boolean); return (w.length > 1 ? w.map((x) => x[0]).join('') : (w[0] || '?')).slice(0, 3).toUpperCase(); };
export const emblemOf = (t) => (t ? t.emblem || (t.code ? `https://crests.football-data.org/${t.code}.png` : '') : '');
export const logoImg = (src, name, cls = 'lgo') => { const sz = cls.includes('big') ? 48 : cls.includes('cr') ? 24 : cls.includes('lgo') ? 36 : 28; return `${src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(name)} logo" width="${sz}" height="${sz}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">` : ''}<i class="${cls} ph"${src ? ' style="display:none"' : ''}>${esc(mono(name))}</i>`; };
export function standingsHtml(t, name, cup = false) {
  if (!t || !t.rows || !t.rows.length) return '';
  const when = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t.updated));
  const n = t.rows.length, down = cup ? 0 : n >= 20 ? 3 : n >= 14 ? 2 : 1;
  const zone = (x) => (cup ? (x.pos <= 8 ? 'up' : x.pos <= 24 ? 'po' : '') : x.pos <= 4 ? 'up' : x.pos > n - down ? 'dn' : '');
  const crest = (x) => logoImg(x.crest, x.tla || x.team, 'cr');
  const key = cup ? '<span class="z up">Top 8: straight to the last 16</span><span class="z po">9th to 24th: knockout play-off</span>' : '<span class="z up">Top four</span>' + (down ? '<span class="z dn">Relegation zone</span>' : '');
  return `<div class="prose tb"><h2>${esc(name)} table${t.season ? ' ' + esc(t.season) : ''}</h2><div class="sc"><div class="th">${logoImg(emblemOf(t), name, 'lgo big')}<div><b>${esc(name)}</b><small>${t.season ? esc(t.season) + ' · ' : ''}live standings</small></div></div><table class="st"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>${t.rows.map((x) => `<tr class="${zone(x)}"><td>${x.pos}</td><td><span class="tt">${crest(x)}<span>${esc(x.team)}</span></span></td><td>${x.p}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td><td>${x.gf}</td><td>${x.ga}</td><td class="${x.gd > 0 ? 'gp' : x.gd < 0 ? 'gn' : ''}">${x.gd > 0 ? '+' : ''}${x.gd}</td><td><b>${x.pts}</b></td></tr>`).join('')}</tbody></table></div><p class="zk">${key}</p><p class="mut">Updated ${when} WAT · Data and club badges from football-data.org; badges belong to their clubs.</p></div>`;
}
