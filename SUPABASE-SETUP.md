# Supabase memory (free) - 5 minutes

Why: Render restarts free services at any time and wipes their memory. Without this, a restart after 07:30 can make the
backend post the morning slips twice, or forget the pick of the day so its result is never posted.

1. supabase.com > New project (free). Pick the region closest to your Render region.
2. SQL Editor > run this once:

   create table if not exists public.kv (
     key text primary key,
     value jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table public.kv enable row level security;

   (Row level security with no policies means only your secret key can read or write it. Nobody on the internet can.)
3. Project Settings > API: copy the Project URL, and the secret / service_role key.
4. Render > your backend > Environment: add SUPABASE_URL and SUPABASE_SERVICE_KEY. Save (it redeploys).
5. Open /api/health on your backend. You should see  "memory": { "supabase": true, "error": null }.

Notes
- The secret key is a master key. Keep it only in Render. Never paste it into the website, GitHub, or a chat. If it leaks, reset it in Supabase.
- It stores one small row (a few KB), kept to the last 3 days. Far below the free 500 MB limit.
- Supabase free projects pause after a week with no activity. The backend writes whenever it posts, so daily posting keeps it awake.
- Free Supabase has no automatic backups. Nothing here is precious (the match data lives on your site's GitHub), so this is fine.
- If Supabase is down or the variables are missing, the backend carries on as before (memory only).
