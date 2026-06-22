# Push Backend

A standalone Node.js server that sends Expo push notifications using
[`expo-server-sdk`](https://github.com/expo/expo-server-sdk-node).

## Setup

```bash
cd push-backend
npm install
cp .env.example .env   # edit if needed
npm run dev            # starts on http://localhost:4000
```

## Endpoints

| Method | Path          | Body                                  | Description                                  |
| ------ | ------------- | ------------------------------------- | -------------------------------------------- |
| GET    | `/`           | —                                     | Health check + registered device count.      |
| POST   | `/register`   | `{ "token": "ExponentPushToken[..]" }` | Save a device's Expo push token.             |
| POST   | `/unregister` | `{ "token": "ExponentPushToken[..]" }` | Remove a token.                              |
| POST   | `/send`       | `{ "title?", "body?", "data?" }`      | Broadcast a notification to all devices.     |

## Send a test notification

After a device has registered:

```bash
curl -X POST http://localhost:4000/send \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Hi\",\"body\":\"Hello from my server\"}"
```

## Notes

- Tokens are stored **in memory** — restart wipes them. Replace `pushTokens`
  with a real database for production.
- The `/send` endpoint is unauthenticated. Protect it before deploying.
- Remote push requires a **physical device** and a **development/release build**
  (not Expo Go on Android since SDK 53).
- From a phone, the app must hit your machine's **LAN IP** (e.g. `http://192.168.1.20:4000`),
  not `localhost`. Use a tunnel like `ngrok` if needed.
- `EXPO_ACCESS_TOKEN` is only required if you enabled enhanced push security on your Expo account.
