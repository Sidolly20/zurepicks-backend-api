// Keeps the backend's memory (which Telegram posts were sent, today's slips, the pick of the day) in Supabase,
// so a Render restart, redeploy or sleep no longer makes it forget and post twice or skip a result.
// Off unless SUPABASE_URL and SUPABASE_SERVICE_KEY are set in Render > Environment. Never put the key in the website.
const BASE = () => (process.env.SUPABASE_URL || '').replace(/\/$/, ''), KEY = () => process.env.SUPABASE_SERVICE_KEY || '';
export const enabled = () => !!(BASE() && KEY());
const headers = () => ({ apikey: KEY(), ...(KEY().startsWith('eyJ') ? { Authorization: 'Bearer ' + KEY() } : {}), 'Content-Type': 'application/json' });

export async function load(id) {
  const r = await fetch(`${BASE()}/rest/v1/kv?key=eq.${encodeURIComponent(id)}&select=value`, { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('supabase load ' + r.status);
  const rows = await r.json(); return rows[0]?.value ?? null;
}
export async function save(id, value) {
  const r = await fetch(`${BASE()}/rest/v1/kv?on_conflict=key`, { method: 'POST', headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: id, value, updated_at: new Date().toISOString() }]), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('supabase save ' + r.status);
}
