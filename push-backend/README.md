# Push Backend

A standalone Node.js server that sends Expo push notifications to the Habitly
app using [`expo-server-sdk`](https://github.com/expo/expo-server-sdk-node).

Deployed to **Vercel** (serverless) with token storage in **Upstash Redis**
and cron-triggered daily + weekly summary pushes via Vercel Cron.

Live: https://push-backend-xi.vercel.app

## Setup (local)

```bash
cd push-backend
npm install
cp .env.example .env   # set UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ADMIN_API_KEY, DEVICE_API_KEY
npm run dev            # starts on http://localhost:4000
```

## Endpoints

| Method | Path                   | Auth        | Body                                                                  | Description                                                |
|--------|------------------------|-------------|-----------------------------------------------------------------------|------------------------------------------------------------|
| GET    | `/`                    | —           | —                                                                     | Admin dashboard UI (HTML).                                 |
| GET    | `/status`              | admin       | —                                                                     | Registered device count + token list + cron schedule.      |
| POST   | `/register`            | device      | `{ "token": "ExponentPushToken[..]" }`                                | Add a device's Expo push token to Redis (idempotent).      |
| POST   | `/unregister`          | device      | `{ "token": "ExponentPushToken[..]" }`                                | Remove a token (e.g., on logout).                          |
| POST   | `/send`                | admin       | `{ "title?", "body?", "data?", "imageUrl?", "to?": string[] }`        | Broadcast to all registered tokens or just `to`.           |
| GET    | `/api/daily-summary`   | cron/admin  | —                                                                     | Sends daily summary push (called by Vercel Cron).          |
| POST   | `/api/daily-summary`   | admin       | `{ "title?", "body?" }`                                               | Manual daily-summary trigger from dashboard.               |
| GET    | `/api/weekly-summary`  | cron/admin  | —                                                                     | Sends weekly review push (Sunday 20:00 UTC).               |
| POST   | `/api/weekly-summary`  | admin       | `{ "title?", "body?" }`                                               | Manual weekly-summary trigger from dashboard.              |

### Auth headers

| Variable          | Required for                                                  | Sent as                                       |
|-------------------|---------------------------------------------------------------|-----------------------------------------------|
| `ADMIN_API_KEY`   | Dashboard, `/status`, `/send`, manual summary triggers        | `X-Admin-Key` or `Authorization: Bearer ...`  |
| `DEVICE_API_KEY`  | `/register`, `/unregister` from the mobile app                | `X-Device-Key`                                |
| `CRON_SECRET`     | Auto-injected by Vercel Cron on `GET /api/*-summary`          | `Authorization: Bearer <CRON_SECRET>`         |

If neither admin nor device keys are set, requests pass through (local-dev
fallback only — **always set these in production**).

## Send a test notification (cURL)

After at least one device has registered:

```bash
curl -X POST https://push-backend-xi.vercel.app/send \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{
    "title": "Time to drink water 💧",
    "body": "Tap to log it.",
    "data": { "screen": "/habit", "habitId": "<paste-a-habit-id>" }
  }'
```

The `data.screen` + `data.habitId` payload is what the app's unified
`handleNotificationResponse` listener uses to deep-link the user straight
to that habit's detail screen — identical to local-notification taps.

## Notes

- **Tokens are persisted in Upstash Redis** (`SADD habit_tracker:push_tokens`),
  not in memory, so restarts and serverless cold starts do not wipe them.
- **`DeviceNotRegistered` handling is automatic** — after every send the server
  polls Expo's receipts endpoint 15 s later and `SREM`s any tokens that come
  back with that error. No manual cleanup required.
- Remote push requires a **physical device** and a **development/release
  build** (not Expo Go on Android since SDK 53).
- `EXPO_ACCESS_TOKEN` is only required if you enabled enhanced push security
  on your Expo account.
