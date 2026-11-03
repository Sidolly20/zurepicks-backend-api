// Builds the Telegram messages (slips, pick of the day, recap, weekly) from the day's data.
import { combos, pick, won, settled, MK, MIN, hm } from './render.js';
const KEYS = ['o', 'dc', 'ou', 'o15', 'bt'], foot = '\n\n18+ · Picks are chances, not guarantees. Play responsibly.';
const h = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rec = (ms) => ms.filter(settled).flatMap((m) => KEYS.map((k) => [k, pick(m, k)]).filter(([k, p]) => p && p.od && p.c >= MIN[k]).map(([k, p]) => ({ m, k, p, w: !!won(m, k, p) })));
const sum = (R) => ({ n: R.length, w: R.filter((x) => x.w).length, r: R.length ? Math.round((R.filter((x) => x.w).length / R.length) * 100) : 0 });

// deps: { matchesFor(date), dataJson(name), dayAt(ms), site, tz }. Returns the message text, or null when there is nothing to post yet.
export async function build(mode, now, { matchesFor, dataJson, dayAt, site, tz }) {
  const t = now.getTime(), today = dayAt(t), date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(t);
  const load = async (d) => (await matchesFor(d)).matches || [];
  if (mode == 'slips') {
    const cs = combos(await load(today), t, true).filter((c) => c.legs.length && [2, 3].includes(c.target)); if (!cs.length) return null;
    const block = (c) => `<b>${c.target} odds slip · total ${c.od.toFixed(2)}</b> (${c.chance}% combined chance)\n` + c.legs.map((x) => `• ${hm(x.m.d)} ${h(x.m.h)} v ${h(x.m.a)}: ${h(MK[x.k].n[x.i])} @${x.od.toFixed(2)}`).join('\n');
    return `⚽ <b>ZurePicks · today’s slips</b>\n${h(date)}\n\n${cs.map(block).join('\n\n')}\n\nTimes are WAT.\nAll tips and match previews: ${site}/${foot}`;
  }
  if (mode == 'potd') {
    const st = await dataJson('potd.json').catch(() => null); if (!st || st.date !== today) return null;
    const m = (await load(today)).find((x) => x.id === st.id); if (!m || Date.parse(m.d) < t) return null;
    const pv = await dataJson('previews.json').catch(() => ({})), file = (pv && pv[st.id]) || '';
    return `★ <b>ZurePicks · pick of the day</b>\n${h(date)}\n\n<b>${h(m.h)} vs ${h(m.a)}</b>\n${h(MK.o.n[st.i])} · ${st.c}% chance · odds ${Number(st.od).toFixed(2)}\nKick-off ${hm(m.d)} WAT\n\nFull preview: ${site}/${file}${foot}`;
  }
  if (mode == 'recap') {
    const ms = await load(today), R = rec(ms), S = sum(R); if (!S.n) return null;
    const byK = KEYS.map((k) => [k, sum(R.filter((x) => x.k == k))]).filter(([, x]) => x.n).map(([k, x]) => `• ${h(MK[k].l)}: ${x.w}/${x.n}`).join('\n');
    let pot = ''; try { const st = await dataJson('potd.json'), m = st && st.date === today && ms.find((x) => x.id === st.id); if (m && settled(m)) pot = `\n★ Pick of the day: ${h(m.h)} ${m.sc[0]}–${m.sc[1]} ${h(m.a)} (${h(MK.o.n[st.i])}) ${won(m, 'o', { i: st.i }) ? '✅ won' : '❌ lost'}\n`; } catch {}
    return `📊 <b>ZurePicks · today’s results</b>\n${h(date)}\n\n${S.w} of ${S.n} published picks won (${S.r}%)\n\n${byK}\n${pot}\nEvery pick, win or lose: ${site}/weekly-review.html${foot}`;
  }
  if (mode == 'weekly') {
    const R = (await Promise.all([1, 2, 3, 4, 5, 6, 7].map((o) => load(dayAt(t - o * 864e5))))).flatMap(rec), S = sum(R); if (!S.n) return null;
    return `🗓 <b>ZurePicks · weekly review</b>\n\nLast 7 days: ${S.w} of ${S.n} published picks won (${S.r}%).\nThe misses, the best calls and each market’s record: ${site}/weekly-review.html${foot}`;
  }
  return null;
}

// One short message for the pick of the day once its game has finished. st = potd.json entry, m = the finished match.
export function potdResult(st, m, { site }) {
  const ok = !!won(m, 'o', { i: st.i });
  return `★ <b>ZurePicks · pick of the day</b>\n\n<b>${h(m.h)} ${m.sc[0]}–${m.sc[1]} ${h(m.a)}</b>\n${h(MK.o.n[st.i])} · ${st.c}% chance · odds ${Number(st.od).toFixed(2)}\n${ok ? '✅ Won' : '❌ Lost'}\n\nEvery pick, win or lose: ${site}/${foot}`;
}
