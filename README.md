# Habitly — Streaks Habit Tracker with Notifications

A mobile habit tracker built with **Expo SDK 55**, **Expo Router**, and
`expo-notifications`. Built end-to-end to demonstrate local notification
scheduling, push notification delivery, deep-link tap handling, streak
management, and permission-reactive UI — on a real device.

| Link | URL |
|------|-----|
| Play Store | [play.google.com/store/apps/details?id=com.nikhild64.habittracker](https://play.google.com/store/apps/details?id=com.nikhild64.habittracker) |
| Dev-build APK | [`app-release.apk`](./app-release.apk) (sideload to test push without building) |
| Push backend (live) | [push-backend-xi.vercel.app](https://push-backend-xi.vercel.app) — admin dashboard |
| Source | [github.com/nikhild64/expo-Habit-Tracker](https://github.com/nikhild64/expo-Habit-Tracker) |
| Demo video | [▶ Watch on GitHub](https://github.com/nikhild64/expo-Habit-Tracker/raw/main/assets/recording/20260627-1654-25.5648006.mp4) (9.4 MB MP4 — full walkthrough) |

---

## Screenshots

<p align="center"><em>Onboarding → daily flow → insights</em></p>

| Onboarding | Welcome | Today |
|:---:|:---:|:---:|
| <img src="https://raw.githubusercontent.com/nikhild64/expo-Habit-Tracker/main/assets/screenshots/Onboarding%201.png" width="240" alt="Onboarding screen 1"/> | <img src="https://raw.githubusercontent.com/nikhild64/expo-Habit-Tracker/main/assets/screenshots/Onboarding%202.png" width="240" alt="Onboarding screen 2"/> | <img src="https://raw.githubusercontent.com/nikhild64/expo-Habit-Tracker/main/assets/screenshots/Home.png" width="240" alt="Today / home screen"/> |

| Habit Detail | Progress | Profile |
|:---:|:---:|:---:|
| <img src="https://raw.githubusercontent.com/nikhild64/expo-Habit-Tracker/main/assets/screenshots/indvidual%20habbit.png" width="240" alt="Individual habit detail"/> | <img src="https://raw.githubusercontent.com/nikhild64/expo-Habit-Tracker/main/assets/screenshots/Progress.png" width="240" alt="Progress / streaks"/> | <img src="https://raw.githubusercontent.com/nikhild64/expo-Habit-Tracker/main/assets/screenshots/profile.png" width="240" alt="Profile / gamification"/> |

| Settings | Weekly Summary | Yearly Review |
|:---:|:---:|:---:|
| <img src="https://raw.githubusercontent.com/nikhild64/expo-Habit-Tracker/main/assets/screenshots/Settings.png" width="240" alt="Settings"/> | <img src="https://raw.githubusercontent.com/nikhild64/expo-Habit-Tracker/main/assets/screenshots/Weekly%20summary.png" width="240" alt="Weekly summary push"/> | <img src="https://raw.githubusercontent.com/nikhild64/expo-Habit-Tracker/main/assets/screenshots/Yearly%20review.png" width="240" alt="Yearly review"/> |

---

## Requirements coverage

Every assignment requirement, mapped to where it lives in the code.

### Core requirements (must complete)

| # | Requirement | Implementation |
|---|---|---|
| 1 | Create habit form (name, icon, time, frequency) | `src/app/new.tsx` |
| 2 | Persistence across app kill/restart | `src/lib/habits/storage.ts` — AsyncStorage `@habits_v2` with versioned migration |
| 3 | Schedule on save, store returned notification IDs | `HabitsContext.addHabit` → `scheduleHabitReminders()` → `habit.notificationIds = ids` |
| 4 | Edit cancels old IDs + schedules new; delete cancels only that habit | `HabitsContext.updateHabit` (cancel → reschedule), `HabitsContext.deleteHabit` (per-ID cancel) |
| 5 | Mark done + streak (increments, resets on miss) | `HabitsContext.markDone` + `computeFrequencyAwareStreak()` in `src/lib/habits/streak.ts` |
| 6 | Deep-link tap → habit detail screen | `data: { screen: '/habit', habitId }` payload + unified `handleNotificationResponse()` in `src/app/_layout.tsx` |
| 7 | Foreground handler | `Notifications.setNotificationHandler({...})` at module scope in `src/lib/notifications/setup.ts` |
| 8 | Custom HIGH-importance Android channel, created before permission request | `setupAndroidChannel()` runs before `requestPermissionsAsync()`. Channel id `habit-reminders`, `AndroidImportance.HIGH` |
| 9 | Permission flow with denied state + open-settings button | Settings screen (`src/app/(tabs)/settings.tsx`) shows status, "Allow Notifications" / "Open System Settings". Today screen shows a banner when denied. App never crashes — `scheduleHabitReminders` returns `[]` when not granted. |

### Push requirements (needs dev build)

| # | Requirement | Implementation |
|---|---|---|
| 10 | Register + show Expo push token + copy | `src/hooks/use-push-notifications.ts` calls `getExpoPushToken()`. The token UI is hidden behind a 5-tap easter egg on the "Version" row in Settings (5 taps within 10 s reveals the push token panel + Copy button + Developer Tools). Same panel shows the auto-registration status. |
| 11 | Deep-linking push notification — reuses tap handler from #6 | Backend `POST /send` accepts `{ data: { screen: '/habit', habitId } }`. App's `handleNotificationResponse` in `_layout.tsx` handles both local and push the same way. |
| 12 | Foreground vs background behavior demonstrated | Foreground handler in `setup.ts` makes pushes show banners while open; background/killed taps are caught via `addNotificationResponseReceivedListener` + `getLastNotificationResponse()`. See [§ Foreground vs background](#7-foreground-vs-background-push-notification-behavior) below. |

### Stretch goals delivered (+15 bonus)

| Goal | Where |
|------|-------|
| Snooze action + Done action (iOS lock-screen buttons) | `registerNotificationCategories()` in `setup.ts`, handled by `HABIT_DONE` / `HABIT_SNOOZE` branches in `handleNotificationResponse` |
| App badge = today's pending habits | `setBadgeCountAsync(pendingCount)` in `HabitsContext.commit()` |
| Tiny Node push server with `DeviceNotRegistered` pruning | `push-backend/server.js` — Express + `expo-server-sdk` + Upstash Redis, deployed to Vercel |
| Push receipts (handles `DeviceNotRegistered`) | `checkReceipts()` polls Expo 15 s after send, `redis.srem` removes dead tokens |
| Image push notification | `imageUrl` field in `POST /send` |
| Quiet hours / do-not-disturb | `src/lib/habits/quiet-hours.ts` + Settings UI; both `scheduleHabitReminders` and the foreground handler honour the DND window |
| Daily summary push via Vercel Cron | `GET /api/daily-summary` triggered at 03:30 UTC by `push-backend/vercel.json` |

---

## Architecture

```
src/
  app/
    _layout.tsx          Root stack + unified notification tap handler (local + push)
    (tabs)/
      _layout.tsx        Tab navigator (4 tabs)
      index.tsx          Today — habits list, done buttons, progress ring, streak pills
      streaks.tsx        Progress — calendar heatmap, history
      profile.tsx        Profile — XP/level/achievements (gamification)
      settings.tsx       Permissions, quiet hours, push token (easter egg), data export
    new.tsx              Create / Edit habit modal
    habit/[id].tsx       Habit detail — deep-link target for both local and push notifications

  lib/
    habits/
      types.ts           Habit and Frequency type definitions
      storage.ts         AsyncStorage v1→v7 migration on load
      streak.ts          computeStreak, computeFrequencyAwareStreak, isDoneToday
      quiet-hours.ts     DND window (used by scheduler + foreground handler)
    notifications/
      setup.ts           Foreground handler (module scope), Android channel, permission helper, iOS action categories
      schedule.ts        scheduleHabitReminders, cancelHabitReminders, snoozeHabitReminder
      push.ts            getExpoPushToken — returns null on simulators / when permission denied

  hooks/
    use-habits.ts             Re-export shim → HabitsContext (kept for back-compat)
    use-push-notifications.ts Push token state + auto-registration with backend

  contexts/
    HabitsContext.tsx    Habit CRUD + streak corrections + badge sync (single source of truth)

push-backend/
  server.js              Express server — /register, /unregister, /send, /api/daily-summary, /api/weekly-summary, receipt check, admin dashboard
  vercel.json            Cron schedule for daily + weekly summary pushes
```

---

## Conceptual Questions

### 1. Local notifications vs push notifications

**Local notifications** are scheduled directly on the device by the app. They do not require network connectivity, a server, or any external service. The OS fires them at the configured time regardless of whether the device is online.

*When to use them:* recurring habit reminders at a fixed time (`DAILY`, `WEEKLY` triggers), anything predictable and device-specific.

*In this app:* every habit schedules one or more local notifications via `scheduleHabitReminders()` in `src/lib/notifications/schedule.ts`. The notification IDs are stored on the habit object so they can be individually cancelled when the habit is edited or deleted.

**Push notifications** are initiated by a remote server and delivered through a push service chain: your server → Expo Push API → FCM (Android) or APNs (iOS) → device. They require a valid push token, network connectivity at delivery time, and credentials configured in both Firebase and the Expo project.

*When to use them:* streak nudges triggered by server-side logic, announcements, messages the server decides to send regardless of what the device has scheduled.

*In this app:* the `push-backend/server.js` Express server persists Expo push tokens in Upstash Redis, sends to all registered devices via `expo-server-sdk`, and checks delivery receipts 15 seconds later — automatically pruning any `DeviceNotRegistered` tokens from the store.

**Key difference:** local notifications are entirely offline and device-controlled. Push notifications depend on a server and the entire delivery chain being available. A missed-day streak nudge ("You haven't logged Workout today!") is a good push use case — the server knows what the user should have done; the device does not.

---

### 2. Android notification channel — why it must exist before requesting permission

Starting with Android 13 (API 33), the OS will only show the `POST_NOTIFICATIONS` permission prompt to the user if **at least one notification channel already exists** on the device. If `requestPermissionsAsync()` is called before any channel is created, Android silently skips the prompt — the user never sees it, the permission stays undetermined, and you cannot ask again.

Additionally, Android 8+ (API 26) requires every notification to belong to a channel. Notifications without a `channelId` fall back to the system-generated "Miscellaneous" channel, which users cannot configure individually and which may have lower importance.

**How this app handles it** (`src/lib/notifications/setup.ts`):

```ts
export async function requestNotificationPermission() {
  await setupAndroidChannel();        // Channel created FIRST
  // ...
  const { status } = await Notifications.requestPermissionsAsync();
  return status;
}
```

`setupAndroidChannel()` is also called on app launch from `_layout.tsx` — before any permission prompt or scheduled notification — so the channel is always present when the OS needs it.

---

### 3. Push ticket vs push receipt

**Ticket** — returned synchronously by `expo.sendPushNotificationsAsync()`. It only tells you that Expo's own servers accepted the message. A `status: "ok"` ticket does *not* mean the device received the notification.

```json
{ "status": "ok", "id": "abc123-ticket-id" }
```

**Receipt** — retrieved later (typically 15–30 seconds) from Expo's receipts endpoint using the ticket ID. It contains the final delivery verdict from FCM or APNs.

```json
{ "status": "ok" }
// or on failure:
{ "status": "error", "message": "...", "details": { "error": "DeviceNotRegistered" } }
```

**Why the delay?** Expo batches push requests and forwards them to FCM/APNs. FCM/APNs then report delivery results asynchronously. Polling receipts too early returns empty results.

**In this app** (`push-backend/server.js`):

```js
setTimeout(() => checkReceipts(tickets, ticketTokenMap).catch(console.error), 15_000);
```

After sending, the server waits 15 seconds and checks receipts. The function maps ticket IDs back to tokens via `ticketTokenMap` — so when a `DeviceNotRegistered` receipt arrives, the exact dead token is automatically removed from Upstash Redis (`redis.srem`). This prevents future sends from hitting invalid tokens.

---

### 4. DeviceNotRegistered

`DeviceNotRegistered` is returned in a receipt when FCM or APNs reports that the push token is no longer associated with an installed app. This happens when:

- The app was uninstalled from the device
- The OS rotated the push token (rare but possible)

When you receive this error in a receipt, you **must** remove that token from your store. Continuing to send to dead tokens wastes your Expo push quota and can result in rate limiting.

**How this backend handles it** (`push-backend/server.js`):

After every send, the server maps each ticket ID back to its source push token in `ticketTokenMap`. Fifteen seconds later `checkReceipts()` polls Expo's receipt endpoint. When a `DeviceNotRegistered` receipt arrives, the offending token is automatically pruned from Upstash Redis:

```js
if (receipt.details?.error === 'DeviceNotRegistered') {
  const token = ticketTokenMap.get(receiptId);
  if (token) {
    await redis.srem(TOKENS_KEY, token);
    console.log('[receipt] Pruned dead token from Redis:', token);
  }
}
```

The `POST /unregister` endpoint is also available for explicit cleanup (e.g., on logout).

---

### 5. Custom sounds and icons in Expo Go

If you schedule a local notification with `sound: 'custom_sound.wav'`, Expo Go will log an error because custom sound files must be bundled into the native binary via the `expo-notifications` config plugin `sounds` array. Expo Go is a pre-built binary that does not include your custom assets. The same limitation applies to custom notification icons on Android.

**Solution:** Use a development build (`expo run:android`) where your `app.json` config plugin runs during prebuild, copies the sound file to `android/app/src/main/res/raw/`, and makes it available at runtime. In this app the channel uses the device default sound, so the error does not occur.

---

### 6. Expo Go limitation

Expo Go is a prebuilt sandbox app. From SDK 53 onwards, **remote push notifications do not work in Expo Go on Android** because:

1. Expo Go uses its own FCM Sender ID and APNs certificate, not the app-specific ones.
2. `getExpoPushTokenAsync({ projectId })` requires that the token be associated with your specific EAS project and FCM credentials — which only happens in a build that includes your `google-services.json`.
3. The Expo push service cannot route to your device using Expo Go's generic credentials.

**This app requires a development build:**

```bash
npx expo run:android   # local build, uses your google-services.json
# or
eas build -p android --profile development
```

**Local notifications still work in Expo Go** — they never touch the network and need no credentials.

---

### 7. Foreground vs background push notification behavior

**Foreground** (app is open and on screen):

Without a `setNotificationHandler`, incoming push notifications are completely silent. This app registers one at module load time in `setup.ts`:

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowList: true,
  }),
});
```

This causes banners to appear even when the app is in the foreground.

**Background / killed** (app is suspended or not running):

The OS delivers the notification natively as a system alert. The app is not woken up by the delivery itself. When the user taps the notification:

- **Backgrounded:** `addNotificationResponseReceivedListener` fires.
- **Killed:** The app launches and `Notifications.getLastNotificationResponse()` returns the tapped response synchronously.

Both cases are handled in `_layout.tsx`:

```ts
// Cold start — app was killed, user tapped notification to open it
const last = Notifications.getLastNotificationResponse();
if (last) handleNotificationResponse(last);

// Foreground / backgrounded tap
const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
```

The **same `handleNotificationResponse` function** processes both local and push notification taps, reading the data payload `{ screen, habitId }` and routing to `habit/[id]`.

---

## Running the project

### 1. Push backend (locally)

```bash
cd push-backend
npm install
cp .env.example .env   # edit if needed
npm run dev            # listens on http://localhost:4000

# Expose over the internet for device testing:
npx localtunnel --port 4000 --subdomain pushtest
```

The live production backend is already deployed at
[push-backend-xi.vercel.app](https://push-backend-xi.vercel.app) — the app
points at it by default via `src/lib/config.ts`, so you only need to run the
backend locally if you want to modify it.

### 2. Development build (required for push notifications)

```bash
# First time — builds and installs on a connected device
npx expo run:android

# Subsequent launches
npx expo start --dev-client
```

Or grab [`app-release.apk`](./app-release.apk) from the repo root and
sideload it on Android to test push without building.

### 3. Where to find the push token in the app

The token UI is hidden behind a 5-tap easter egg to keep the consumer
release clean.

> **Settings → About → Version** → tap 5× within 10 seconds. A "Push Token"
> panel appears with the full token + a **Copy Token** button. A "Developer
> Tools" section is also revealed.

The token is also automatically POSTed to the backend (`/register`) every
time the app launches with permission granted, so you can send from the
admin dashboard without copying it manually.

### 4. Test checklist

| Step                              | Expected result                                                                      |
|-----------------------------------|--------------------------------------------------------------------------------------|
| Open app → Settings               | Permission prompt appears; status badge shows "Enabled" after grant                 |
| Create a habit                    | Notification scheduled; habit appears on Today                                       |
| Background app, wait for reminder | Notification banner fires at configured time                                         |
| Tap notification banner           | App opens to correct habit detail screen                                             |
| Settings → tap Version 5×         | Push Token panel appears with Copy button                                            |
| Send push from dashboard          | Foreground: in-app banner. Background: system banner. Tap: opens habit detail.       |
| Mark habit done                   | Streak increments; circle turns green                                                |
| Miss a day, mark done again       | Streak resets to 1                                                                   |
| Edit habit frequency              | Old notification cancelled; new one scheduled                                        |
| Delete habit                      | Only that habit's notification cancelled; others unchanged                           |

---

## Data model

```ts
type Frequency =
  | { kind: 'daily';    hour: number; minute: number }
  | { kind: 'weekly';   weekdays: number[]; hour: number; minute: number }
  // Extra frequency kinds beyond the assignment spec:
  | { kind: 'weekdays'; hour: number; minute: number }
  | { kind: 'weekends'; hour: number; minute: number }
  | { kind: 'xperweek'; count: number;      hour: number; minute: number }
  | { kind: 'interval'; days: number;       hour: number; minute: number };

type Habit = {
  id: string;
  name: string;
  icon: string;                // Ionicons icon name (also accepts an emoji char)
  color: string;               // Hex colour for the icon badge
  frequency: Frequency;
  notificationIds: string[];   // Stored so each habit's reminders can be cancelled precisely
  streak: number;
  bestStreak: number;
  completions: string[];       // YYYY-MM-DD list — the source of truth for streak math
  lastCompletedISO: string | null;
  createdAt: string;
  // ...plus extras for paused/archived state, pin, category, freezes, notes, etc.
};
```

### Notification payload contract

All local habit reminders and push notification test payloads use:

```json
{
  "data": {
    "screen": "/habit",
    "habitId": "<habit.id>"
  }
}
```

The unified tap handler in `_layout.tsx` reads `screen` and `habitId` and
routes to `/habit/[id]` for both local and push notification taps. Push
payloads from the backend dashboard, daily-summary cron (`screen: '/summary'`)
and weekly-review cron (`screen: '/weekly-review'`) use the same shape.
