# Habit Tracker

A mobile habit tracker built with Expo SDK 55, Expo Router, and `expo-notifications`. Demonstrates local notification scheduling, push notification delivery, deep-link tap handling, and streak management — end-to-end on a real device.

---

## Architecture

```
src/
  app/
    _layout.tsx          Root stack — unified notification tap handler (local + push)
    (tabs)/
      _layout.tsx        Tab navigator: Today | Settings
      index.tsx          Today's habits, done buttons, progress bar, streak badges
      settings.tsx       Permission status, push token, collapsible developer tools
    new.tsx              Create / Edit habit modal
    habit/[id].tsx       Habit detail — deep-link target for both notification types

  lib/
    habits/
      types.ts           Habit and Frequency type definitions
      storage.ts         AsyncStorage load / save
    notifications/
      setup.ts           Foreground handler (module scope), Android channel, permission helper
      schedule.ts        scheduleHabitReminders, cancelHabitReminders, one-off local
      push.ts            getExpoPushToken — push token registration
    ui/
      colors.ts          Design tokens, habit icon and colour palettes

  hooks/
    use-habits.ts        Habit CRUD, streak logic, AsyncStorage sync, app badge
    use-push-notifications.ts  Push token and permission status for Settings UI

push-backend/
  server.js             Express server — /register, /send, /unregister, receipt check
```

---

## Conceptual Questions

### 1. Local notifications vs push notifications

**Local notifications** are scheduled directly on the device by the app. They do not require network connectivity, a server, or any external service. The OS fires them at the configured time regardless of whether the device is online.

*When to use them:* recurring habit reminders at a fixed time (`DAILY`, `WEEKLY` triggers), anything predictable and device-specific.

*In this app:* every habit schedules one or more local notifications via `scheduleHabitReminders()` in `src/lib/notifications/schedule.ts`. The notification IDs are stored on the habit object so they can be individually cancelled when the habit is edited or deleted.

---

**Push notifications** are initiated by a remote server and delivered through a push service chain: your server → Expo Push API → FCM (Android) or APNs (iOS) → device. They require a valid push token, network connectivity at delivery time, and credentials configured in both Firebase and the Expo project.

*When to use them:* streak nudges triggered by server-side logic, announcements, messages the server decides to send regardless of what the device has scheduled.

*In this app:* the `push-backend/server.js` Express server persists Expo push tokens in Upstash Redis, sends to all registered devices via `expo-server-sdk`, and checks delivery receipts 15 seconds later — automatically pruning any `DeviceNotRegistered` tokens from the store.

---

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

**Ticket** — returned synchronously by `expo.sendPushNotificationsAsync()`. It only tells you that Expo's own servers accepted the message. A `status: "ok"` ticket does not mean the device received the notification.

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

The `POST /unregister` endpoint is also available for explicit cleanup (e.g., on logout or when the app detects a token change via `addPushTokenListener`).

---

### 5. Custom sounds and icons in Expo Go

If you schedule a local notification with `sound: 'custom_sound.wav'`, Expo Go will log an error because custom sound files must be bundled into the native binary via the `expo-notifications` config plugin `sounds` array. Expo Go is a pre-built binary that does not include your custom assets. This same limitation applies to custom notification icons on Android.

**Solution:** Use a development build (`expo run:android`) where your `app.json` config plugin runs during prebuild, copies the sound file to `android/app/src/main/res/raw/`, and makes it available at runtime. In this app, the notification channel uses the device default sound (no custom sound string passed), so this error does not occur.

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

### 6. Foreground vs background push notification behavior

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

This causes banners to appear even when the app is in the foreground. `addNotificationReceivedListener` fires — the Settings screen updates the "Last Received" panel immediately.

**Background / killed** (app is suspended or not running):

The OS delivers the notification natively as a system alert. The app is not woken up by the delivery itself. When the user taps the notification:
- **Backgrounded:** `addNotificationResponseReceivedListener` fires.
- **Killed:** The app launches and `Notifications.getLastNotificationResponse()` returns the tapped response synchronously.

Both cases are handled in `_layout.tsx`:

```ts
// Cold start
const last = Notifications.getLastNotificationResponse();
if (last) handleNotificationTap(last);

// Foreground / background tap
const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationTap);
```

The **same `handleNotificationTap` function** processes both local and push notification taps, reading the data payload `{ screen, habitId }` and routing to `habit/[id]`.

---

## Running the project

### 1. Push backend

```bash
cd push-backend
npm run dev
# Expose over the internet for device testing:
npx localtunnel --port 4000 --subdomain pushtest
```

### 2. Development build (required for push notifications)

```bash
# First time — builds and installs on connected device
npx expo run:android

# Subsequent launches
npx expo start --dev-client
```

### 3. Test checklist

| Step | Expected result |
|------|----------------|
| Open app → Settings | Permission prompt appears; token shown after grant |
| Create a habit | Notification scheduled; habit appears on Today |
| Background app, wait for reminder | Notification banner fires at configured time |
| Tap notification banner | App opens to correct habit detail screen |
| Health Check in Settings | Returns `ok — N device(s)` |
| Register Device → Send Push | Notification arrives; foreground: "Last Received" updates; background: system banner |
| Mark habit done | Streak increments; circle turns green |
| Miss a day, mark done again | Streak resets to 1 |
| Edit habit frequency | Old notification cancelled; new one scheduled |
| Delete habit | Only that habit's notification cancelled; others unchanged |

---

## Stretch goals implemented

| Goal | Where |
|------|-------|
| App badge count | `use-habits.ts` — `setBadgeCountAsync(pendingCount)` on every mutation and app launch |
| Push receipts | `push-backend/server.js` — `checkReceipts()` polls Expo 15 s after send |
| DeviceNotRegistered pruning | `push-backend/server.js` L339–344 — automatically removes dead token from Upstash Redis |
| Node push server | `push-backend/server.js` — Express + `expo-server-sdk` + Upstash Redis, deployed to Vercel |
| Quiet hours | `src/lib/habits/quiet-hours.ts` + `settings.tsx` — configurable DND window; reminders inside the window are not scheduled |
| Image push notification | `push-backend/server.js` — `imageUrl` field supported in `/send`; pass any public image URL from the dashboard |
| Daily summary push | `push-backend/server.js` + Vercel Cron (`vercel.json`) — fires daily at 03:00 UTC (≈ 08:30 IST) |
| Auto token registration | `use-push-notifications.ts` — POSTs token to `/register` on launch after permission is granted |

---

## Data model

```ts
type Frequency =
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; weekdays: number[]; hour: number; minute: number };

type Habit = {
  id: string;
  name: string;
  icon: string;          // Ionicons icon name
  color: string;         // Hex colour for the icon badge
  frequency: Frequency;
  notificationIds: string[];   // Stored so they can be cancelled per-habit
  streak: number;
  bestStreak: number;
  lastCompletedISO: string | null;
  createdAt: string;
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

The unified tap handler in `_layout.tsx` reads `screen` and `habitId` and routes to `/habit/[id]` for both local and push notification taps.
