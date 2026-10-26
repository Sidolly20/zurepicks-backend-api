# ZurePicks API

Base URL: the deployed backend origin, for example `https://your-service.onrender.com`.
All API responses are JSON. Dates use `YYYY-MM-DD` in `TZ_NAME` (default `Africa/Lagos`).

## Public endpoints

- `GET /api/health` — service health, snapshot dates, data coverage, and last snapshot update.
- `GET /api/matches?date=YYYY-MM-DD` — match data, score/status, bookmaker odds, and normalized probabilities for available markets.
- `GET /api/matches/range?from=YYYY-MM-DD&to=YYYY-MM-DD` — multiple daily snapshots.
- `GET /api/predictions?date=YYYY-MM-DD` — compact prediction response.
- `GET /api/history` — historical settlement records.
- `GET /api/track-record` — aggregate settled picks and win rates per market.
- `GET /api/refresh-status` — current refresh process status and recent log output.

## Protected data refresh

`POST /api/refresh` requires `Authorization: Bearer <REFRESH_TOKEN>`. The server returns `202 Accepted` and refreshes fixtures/odds using `API_FOOTBALL_KEY`; optional `BZZOIRO_KEY` fills some missing odds. Poll `/api/refresh-status` for completion. Keep provider keys and the refresh token in server environment variables only; never put them in frontend files.

## Prediction method

The current probabilities are derived from bookmaker decimal odds with the implied bookmaker margin normalized away. They are **not** an independent AI prediction model and are not guarantees. A future model can be added behind the same API contract after gathering and evaluating historical data.

## Render deployment

- Create a **Web Service** from this folder/repository.
- Runtime: Node; Build command: `npm install` (no third-party packages are required); Start command: `npm start`.
- Set `API_FOOTBALL_KEY`, `REFRESH_TOKEN`, and `CORS_ORIGINS` in Render Environment. Set `CORS_ORIGINS` to the exact frontend origin once deployed, e.g. `https://your-frontend.onrender.com` (no trailing slash). Optional: `BZZOIRO_KEY`, `TZ_NAME`, `MAX_CALLS`, `ODDS_BOOKMAKER`, and `AUTO_REFRESH_HOURS` (default 6; set to `0` to disable). With a key configured, automatic refresh begins 30 seconds after startup and repeats on that interval. At 22 calls per refresh and a six-hour interval, the generator can use up to about 88 API-Football calls per day; lower `MAX_CALLS` or increase the interval if your plan has a smaller quota. On sleeping/free hosts, use an external scheduled job if you need guaranteed refresh times.
- For persistence across restarts, attach a persistent disk and set `DATA_DIR` to its mount path (e.g. `/var/data`). The server seeds that directory with the bundled snapshots when the directory is empty. The refresh script writes to `DATA_DIR`.
- Provider usage is bounded by `MAX_CALLS` per refresh. API-Football quotas vary by plan; monitor remaining requests and do not trigger refresh repeatedly.

## Frontend connection

After the backend is deployed, edit `api-config.js` in the frontend ZIP and set `window.ZUREPICKS_API_BASE` to the backend origin. The homepage uses the API when available and falls back to the published JSON snapshots when it is not connected.
