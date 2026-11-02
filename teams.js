// One shared way to turn a team name into a matching key, so "Arsenal FC", "Arsenal" and "arsenal" are the same team.
const DROP = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'as', 'fk', 'sk', 'ssc', 'us', 'cd', 'ud', 'rc', 'rcd', 'fsv', 'vfl', 'vfb', 'tsg', 'sv', 'bsc', 'ca', 'cs', 'sd', 'ss', 'ssd', 'sj', 'de', 'la', 'the', 'club', 'calcio', 'cfc', 'hsc', 'if', 'bk', 'ifk', 'og']);
const ALIAS = { utd: 'united', man: 'manchester', wolves: 'wolverhampton', spurs: 'tottenham', hotspur: 'tottenham', saint: 'st', 'sankt': 'st', paris: 'paris', psg: 'paris', 'monchengladbach': 'gladbach', mgladbach: 'gladbach', internazionale: 'inter', milan: 'milan', athletic: 'athletic', atletico: 'atletico', atl: 'atletico', borussia: '', bayer: '', eintracht: '', rasenballsport: '', sporting: 'sporting', sporting_cp: 'sporting' };
export function teamKey(name) {
  const t = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .map((w) => (w in ALIAS ? ALIAS[w] : w)).filter((w) => w && !DROP.has(w) && !/^\d+$/.test(w) && w !== 'and');
  return [...new Set(t)].sort().join(' ');
}
// Same real team? Equal keys, or one key inside the other. Youth/women/reserve sides never match a senior side.
const TAGS = /^(u\d\d|ii|iii|b|w|women|reserves|youth|jong|sub21|castilla)$/;
const tagsOf = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => TAGS.test(w)).sort().join();
export function sameTeam(a, b) {
  const x = teamKey(a), y = teamKey(b);
  if (!x || !y || tagsOf(a) !== tagsOf(b)) return false;
  return x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)));
}
