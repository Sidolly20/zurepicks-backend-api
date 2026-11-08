# ZurePicks social add-on (all free)

## What changed
- `social.mjs` (new): copies each Telegram post to your Facebook Page with hashtags, and sends YOU a one-tap "Post to X" link.
- `posts.mjs`: remembers the 2 and 3 odds slips it posts, and builds a result message.
- `scheduler.mjs`: adds a 07:30 slips post (Lagos) and posts each slip's result as soon as every game on it has finished.
  Not wanted? Delete the `{ id: 'slips', h: 7, m: 30 }` entry in JOBS.
- `.env.example`: three new optional settings.

Upload these 4 files to your backend GitHub repo (same names, replace). Render redeploys by itself.

## Facebook Page (free) - about 10 minutes
1. Have a Facebook Page you are admin of.
2. Go to developers.facebook.com > My Apps > Create App. Add the Pages permissions `pages_show_list` and `pages_manage_posts`.
3. Open Graph API Explorer, pick your app, choose "User Token", tick those two permissions, press Generate.
4. In the Explorer, run GET `/me/accounts`. Your Page appears with its `id` and `access_token`.
   (Meta's screens change often. If a step looks different, send me a screenshot.)
5. In Render > your service > Environment add:
   FB_PAGE_ID = the Page id
   FB_PAGE_TOKEN = the Page access_token
6. Never paste these into chat or GitHub.

## One-tap X link (free)
1. Send any message to your bot in Telegram (your private chat, not the channel).
2. Open https://api.telegram.org/botYOURTOKEN/getUpdates in your browser (replace YOURTOKEN) and find "chat":{"id": ...}. Don't share that page.
3. In Render Environment add TELEGRAM_ADMIN_CHAT_ID = that number.
After each post the bot sends you "Tap to post this on X". Tap, then press Post.

## Check it works
Open `https://YOUR-RENDER-URL/api/health`. It shows `lastRun`, including `social slips` and `slipresult`. Each says sent / skipped / error.
Note: sent-post memory resets when Render redeploys, as before.
