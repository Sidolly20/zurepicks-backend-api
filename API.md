# ZurePicks API (v2)

Odds, picks and fixtures come from the website's own data files (refreshed by its GitHub Action). Scores, minutes and final results are laid on top live from Bzzoiro.

- `GET /api/health`: status, plus how old the live and finished data are, and any error.
- `GET /api/matches?date=YYYY-MM-DD`: that day's games in the same shape as the site's data files. Adds `source` (`live` or `snapshot`), `liveUpdated` and `liveError`.
- `GET /api/live`: compact list of games in play right now.
- `/api/ai-chat/*`: retired (HTTP 410). It used to return made-up demo games.

Live data is cached 20 s (in-play) and 60 s (finished). If Bzzoiro is slow or down, the last good answer is served and `liveError` says why.

## Render
Web Service, build `npm install`, start `npm start`. Set `BZZOIRO_KEY`. Free instances sleep after 15 minutes without visits, so add a free UptimeRobot monitor on `/api/health` every 5 minutes.
