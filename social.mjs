// Free social mirroring: posts the same message to a Facebook Page, and sends YOU a one-tap "Post to X" link on Telegram.
// Everything is optional: with no FB_* / TELEGRAM_ADMIN_CHAT_ID set, it quietly does nothing. Never throws.
const SITE = () => (process.env.SITE_URL || 'https://sidolly20.github.io/zurepick-site').replace(/\/$/, '');
const plain = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const TAGS = {
  slips: ['#FootballTips', '#2Odds', '#3Odds', '#Accumulator', '#BettingTips'],
  daily: ['#FootballTips', '#BettingTips', '#Accumulator', '#2Odds', '#3Odds'],
  potd: ['#PickOfTheDay', '#FootballTips', '#BettingTips', '#Soccer'],
  recap: ['#FootballResults', '#FootballTips', '#BettingTips', '#Soccer'],
  weekly: ['#WeeklyReview', '#FootballTips', '#BettingTips', '#Soccer'],
  result: ['#FootballResults', '#BetResults', '#FootballTips', '#Soccer', '#BettingTips'],
};
export const tagsFor = (mode, n) => (TAGS[mode] || TAGS.daily).slice(0, n);
function shortFor(p, max) { if (p.length <= max) return p; const cut = p.slice(0, max), i = cut.lastIndexOf('\n'); return (i > 60 ? cut.slice(0, i) : cut.slice(0, max - 1)).trimEnd() + '…'; }
export const xLink = (mode, html) => 'https://x.com/intent/post?text=' + encodeURIComponent(shortFor(plain(html).replace(/\n18\+.*$/s, ''), 190) + '\n\n' + SITE() + '\n' + tagsFor(mode, 2).join(' '));

export async function fbPost(mode, html, env = process.env) {
  const id = env.FB_PAGE_ID, tok = env.FB_PAGE_TOKEN; if (!id || !tok) return 'skipped (not set up)';
  const v = env.FB_GRAPH_VERSION ? env.FB_GRAPH_VERSION + '/' : '';
  const r = await fetch(`https://graph.facebook.com/${v}${id}/feed`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ message: plain(html) + '\n\n' + tagsFor(mode, 5).join(' '), access_token: tok }), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.id) throw new Error('Facebook ' + r.status + ' ' + ((j.error && j.error.message) || ''));
  return 'sent';
}
async function adminX(mode, html, env = process.env) {
  const chat = env.TELEGRAM_ADMIN_CHAT_ID, tok = env.TELEGRAM_BOT_TOKEN; if (!chat || !tok) return 'skipped (not set up)';
  const text = `📝 <a href="${xLink(mode, html)}">Tap to post this on X</a>`;
  const r = await fetch(`${env.TELEGRAM_API_BASE || 'https://api.telegram.org'}/bot${tok}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error('Telegram admin ' + r.status + ' ' + (j.description || ''));
  return 'sent';
}
export async function mirror(mode, html, env = process.env) {
  const out = {};
  for (const [k, f] of [['facebook', fbPost], ['x_link', adminX]]) { try { out[k] = await f(mode, html, env); } catch (e) { out[k] = 'error: ' + e.message; } }
  return out;
}
