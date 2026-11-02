# ZurePicks API (v2)

Odds, picks and fixtures come from the website's own data files (refreshed by its GitHub Action). Scores, minutes and final results are laid on top live from Bzzoiro.

- `GET /api/health`: status, plus how old the live and finished data are, and any error.
- `GET /api/matches?date=YYYY-MM-DD`: that day's games in the same shape as the site's data files. Adds `source` (`live` or `snapshot`), `liveUpdated` and `liveError`.
- `GET /api/live`: compact list of games in play right now.
- `/api/ai-chat/*`: retired (HTTP 410). It used to return made-up demo games.

Live data is cached 20 s (in-play) and 60 s (finished). If Bzzoiro is slow or down, the last good answer is served and `liveError` says why.

## Render
Web Service, build `npm install`, start `npm start`. Set `BZZOIRO_KEY`. Free instances sleep after 15 minutes without visits, so add a free UptimeRobot monitor on `/api/health` every 5 minutes.

## v3: the backend keeps time
- Posts to your Telegram channel at 07:30 (today's slips), 07:45 (pick of the day), 22:30 (results recap) and Monday 08:00 (weekly review), Lagos time. It needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
- If `GITHUB_TOKEN` is set, it also starts the site's "Update match data" run every 10 minutes.
- `GET /api/health` shows what was sent today (`telegram.sentToday`), the last result of each job and the last data refresh.
- A post that is missed (for example during a restart) is still sent for up to 45 minutes after its time, then skipped.
