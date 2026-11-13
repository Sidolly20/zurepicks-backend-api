// The backend is the clock: it posts to Telegram at fixed times (Africa/Lagos) and pokes GitHub to refresh the site's data.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID for posting; GITHUB_TOKEN (+ GITHUB_REPO) is optional, for the data refresh.
import { matchesFor, dataJson, dayAt, TZ } from './core.mjs';
import { build, potdResult, logSlips, postedSlips, slipResult, slipLog } from './posts.mjs';
import * as db from './persist.mjs';
import { mirror } from './social.mjs';
import { settled } from './render.js';
const T = () => process.env.TELEGRAM_BOT_TOKEN, C = () => process.env.TELEGRAM_CHAT_ID, API = () => process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
const SITE_URL = () => (process.env.SITE_URL || 'https://sidolly20.github.io/zurepick-site').replace(/\/$/, '');
export const JOBS = [{ id: 'slips', h: 7, m: 30 }, { id: 'daily', h: 23, m: 15 }]; // morning slips + evening update (Lagos). Delete a line to stop that post.
const WINDOW = 45; // minutes after the set time during which a missed post is still sent
export const state = { sent: {}, lastRun: {}, lastDispatch: null, dispatchError: null, potd: {} };
const busy = new Set();

export function clock(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: dayAt(now.getTime()), mins: (+p.hour % 24) * 60 + +p.minute, dow: p.weekday };
}
export const dueJobs = (now = new Date()) => { const c = clock(now); return JOBS.filter((j) => (!j.dow || j.dow == c.dow) && c.mins >= j.h * 60 + j.m && c.mins < j.h * 60 + j.m + WINDOW && !state.sent[j.id + c.date]); };

async function sendTelegram(text) {
  const r = await fetch(`${API()}/bot${T()}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: C(), text, parse_mode: 'HTML', disable_web_page_preview: true }), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error('Telegram ' + r.status + ' ' + (j.description || ''));
}

export async function tick(now = new Date(), deps = {}) {
  const send = deps.send || sendTelegram, builder = deps.build || ((mode, n) => build(mode, n, { matchesFor, dataJson, dayAt, site: SITE_URL(), tz: TZ }));
  if (!deps.send && !(T() && C())) return [];
  const out = [];
  for (const j of dueJobs(now)) {
    const key = j.id + clock(now).date; if (busy.has(key)) continue; busy.add(key);
    try { const text = await builder(j.id, now); state.lastRun[j.id] = { at: new Date().toISOString(), result: text ? 'sent' : 'nothing to post yet' }; if (text) { await send(text); state.sent[key] = new Date().toISOString(); persistState().catch(() => {}); out.push(j.id); state.lastRun['social ' + j.id] = { at: new Date().toISOString(), result: JSON.stringify(await (deps.mirror || mirror)(j.id, text)) }; } }
    catch (e) { state.lastRun[j.id] = { at: new Date().toISOString(), result: 'error: ' + e.message }; }
    finally { busy.delete(key); }
  }
  return out;
}

// Posts the pick of the day's result as soon as its game has finished (once per pick; ignored if the game ended over 8 hours ago).
export async function checkPotd(now = new Date(), deps = {}) {
  const send = deps.send || sendTelegram; if (!deps.send && !(T() && C())) return false;
  const getPotd = deps.potd || (() => dataJson('potd.json')), getMatches = deps.matches || matchesFor;
  const c = clock(now), st = await getPotd().catch(() => null);
  if (st && st.date && st.id) state.potd[st.date] = st; // each day's pick is remembered, so a result after midnight is still posted
  let did = false;
  for (const p of Object.values(state.potd)) {
    const key = 'potdresult' + p.date; if (state.sent[key] || busy.has(key)) continue; busy.add(key);
    try {
      const m = ((await getMatches(p.date)).matches || []).find((x) => x.id === p.id);
      if (!m || !settled(m)) continue;
      if (now.getTime() - Date.parse(m.d) > 8 * 36e5) { state.sent[key] = 'skipped (too old)'; continue; }
      const msg = potdResult(p, m, { site: SITE_URL() }); await send(msg); await (deps.mirror || mirror)('result', msg);
      state.sent[key] = new Date().toISOString(); persistState().catch(() => {}); state.lastRun.potdresult = { at: new Date().toISOString(), result: 'sent' }; did = true;
    } catch (e) { state.lastRun.potdresult = { at: new Date().toISOString(), result: 'error: ' + e.message }; }
    finally { busy.delete(key); }
  }
  for (const d of Object.keys(state.potd)) if (d < dayAt(now.getTime() - 3 * 864e5)) delete state.potd[d];
  return did;
}

// Posts each published 2/3 odds slip's result as soon as every one of its games has finished (once per slip; dropped after 60 hours).
export async function checkSlips(now = new Date(), deps = {}) {
  const send = deps.send || sendTelegram; if (!deps.send && !(T() && C())) return 0;
  const getMatches = deps.matches || matchesFor, cache = {}; let n = 0;
  for (const sl of postedSlips.values()) {
    const key = 'slipresult' + sl.key; if (state.sent[key] || busy.has(key)) continue; busy.add(key);
    try {
      if (now.getTime() - sl.at > 60 * 36e5) { state.sent[key] = 'skipped (too old)'; continue; }
      const byId = new Map();
      for (const d of new Set(sl.legs.map((x) => x.date))) { cache[d] = cache[d] || ((await getMatches(d)).matches || []); cache[d].forEach((m) => byId.set(m.id, m)); }
      if (sl.legs.some((x) => { const m = byId.get(x.id); return !m || !settled(m); })) continue;
      const msg = slipResult(sl, byId, { site: SITE_URL() }); await send(msg); await (deps.mirror || mirror)('result', msg);
      state.sent[key] = new Date().toISOString(); persistState().catch(() => {}); state.lastRun.slipresult = { at: new Date().toISOString(), result: 'sent' }; n++;
    } catch (e) { state.lastRun.slipresult = { at: new Date().toISOString(), result: 'error: ' + e.message }; }
    finally { busy.delete(key); }
  }
  for (const [k, sl] of postedSlips) if (now.getTime() - sl.at > 72 * 36e5) postedSlips.delete(k);
  return n;
}

// Ask GitHub to run "Update match data" (its own 10-minute timer is unreliable on free repos).
export async function dispatchUpdate(minGapMs = 9 * 60 * 1000, now = Date.now()) {
  const tok = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'Sidolly20/zurepick-site';
  if (!tok || (state.lastDispatch && now - Date.parse(state.lastDispatch) < minGapMs)) return false;
  state.lastDispatch = new Date(now).toISOString();
  try { const r = await fetch(`${process.env.GITHUB_API_BASE || 'https://api.github.com'}/repos/${repo}/actions/workflows/update.yml/dispatches`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'zurepicks-api', 'content-type': 'application/json' }, body: JSON.stringify({ ref: 'main' }), signal: AbortSignal.timeout(15000) }); state.dispatchError = r.status == 204 ? null : 'GitHub ' + r.status; return r.status == 204; }
  catch (e) { state.dispatchError = e.message; return false; }
}

// --- Memory that survives restarts (Supabase table "kv"; see SUPABASE-SETUP.md). Does nothing if Supabase is not configured. ---
const KEEP_MS = 3 * 864e5; let lastSaved = '';
export async function restoreState() {
  if (!db.enabled()) return false;
  try {
    const v = await db.load('state'); if (!v) return true;
    Object.assign(state.sent, v.sent || {}); Object.assign(state.potd, v.potd || {});
    for (const [k, x] of v.slipLog || []) slipLog.set(k, x);
    for (const [k, x] of v.postedSlips || []) postedSlips.set(k, x);
    lastSaved = JSON.stringify(snapshotState()); console.log('Restored state from Supabase'); return true;
  } catch (e) { console.log('Could not restore state: ' + e.message); return false; }
}
function snapshotState() {
  const cut = Date.now() - KEEP_MS, day = dayAt(cut);
  return { sent: Object.fromEntries(Object.entries(state.sent).filter(([k]) => !/\d{4}-\d\d-\d\d$/.test(k) || k.slice(-10) >= day)),
    potd: state.potd, slipLog: [...slipLog].filter(([, x]) => !x.date || x.date >= day), postedSlips: [...postedSlips].filter(([, x]) => typeof x.at != 'number' || x.at > cut) };
}
export async function persistState() {
  if (!db.enabled()) return;
  try { const snap = snapshotState(), txt = JSON.stringify(snap); if (txt == lastSaved) return; await db.save('state', snap); lastSaved = txt; }
  catch (e) { state.persistError = e.message; }
}
export const startScheduler = () => { const go = () => { tick().catch(() => {}); logSlips(new Date(), { matchesFor, dayAt }).catch(() => {}); checkPotd().catch(() => {}); checkSlips().catch(() => {}); dispatchUpdate().catch(() => {}); persistState().catch(() => {}); }; setInterval(go, 60000); setTimeout(go, 15000); };
