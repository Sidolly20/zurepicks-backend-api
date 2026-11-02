// The backend is the clock: it posts to Telegram at fixed times (Africa/Lagos) and pokes GitHub to refresh the site's data.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID for posting; GITHUB_TOKEN (+ GITHUB_REPO) is optional, for the data refresh.
import { matchesFor, dataJson, dayAt, TZ } from './core.mjs';
import { build } from './posts.mjs';
const T = () => process.env.TELEGRAM_BOT_TOKEN, C = () => process.env.TELEGRAM_CHAT_ID, API = () => process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
const SITE_URL = () => (process.env.SITE_URL || 'https://sidolly20.github.io/zurepick-site').replace(/\/$/, '');
export const JOBS = [{ id: 'slips', h: 7, m: 30 }, { id: 'potd', h: 7, m: 45 }, { id: 'recap', h: 22, m: 30 }, { id: 'weekly', h: 8, m: 0, dow: 'Mon' }];
const WINDOW = 45; // minutes after the set time during which a missed post is still sent
export const state = { sent: {}, lastRun: {}, lastDispatch: null, dispatchError: null };
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
    try { const text = await builder(j.id, now); state.lastRun[j.id] = { at: new Date().toISOString(), result: text ? 'sent' : 'nothing to post yet' }; if (text) { await send(text); state.sent[key] = new Date().toISOString(); out.push(j.id); } }
    catch (e) { state.lastRun[j.id] = { at: new Date().toISOString(), result: 'error: ' + e.message }; }
    finally { busy.delete(key); }
  }
  return out;
}

// Ask GitHub to run "Update match data" (its own 10-minute timer is unreliable on free repos).
export async function dispatchUpdate(minGapMs = 9 * 60 * 1000, now = Date.now()) {
  const tok = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'Sidolly20/zurepick-site';
  if (!tok || (state.lastDispatch && now - Date.parse(state.lastDispatch) < minGapMs)) return false;
  state.lastDispatch = new Date(now).toISOString();
  try { const r = await fetch(`${process.env.GITHUB_API_BASE || 'https://api.github.com'}/repos/${repo}/actions/workflows/update.yml/dispatches`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'zurepicks-api', 'content-type': 'application/json' }, body: JSON.stringify({ ref: 'main' }), signal: AbortSignal.timeout(15000) }); state.dispatchError = r.status == 204 ? null : 'GitHub ' + r.status; return r.status == 204; }
  catch (e) { state.dispatchError = e.message; return false; }
}
export const startScheduler = () => { const go = () => { tick().catch(() => {}); dispatchUpdate().catch(() => {}); }; setInterval(go, 60000); setTimeout(go, 15000); };
