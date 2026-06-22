# Assignment — "Streaks" Habit Tracker (Local + Push Notifications)

Build a habit tracker where a user creates habits (e.g. *Drink water*, *Code 1 hr*,
*Read*, *Workout*). Each habit schedules **local** reminders on the device, and a
"server" can send **push** notifications (streak nudges, announcements) to the same app.

The whole point of this project: prove you understand **when to use local vs push**, and
that **deep-linking from a tapped notification works identically for both**.

---

## 0. Rules

- ⚠️ Read the versioned docs before coding: [https://docs.expo.dev/versions/v55.0.0/sdk/notifications/](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/)
- Push does **NOT** work in Expo Go. You must make a **dev build** (`eas build`) for the push parts.
- All notification logic must be reactive to **permissions** — handle the "denied" case, don't crash.
- Keep notification side-effects out of components. Put them in `src/lib/notifications/`*
and expose them through hooks (follow the existing project layout).

---

## 1. Core requirements (must complete — pass/fail)


| #   | Requirement                                                                                                                                          | Concept (see notes)                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | **Create habit** — form: name, emoji/icon, reminder time(s), frequency (daily or specific weekdays).                                                 | `DAILY` / `WEEKLY` triggers — NOTES Ex. 12                       |
| 2   | **Persistence** — habits and their scheduled IDs survive an app kill/restart (use `AsyncStorage` or `expo-sqlite`).                                  | state design                                                     |
| 3   | **Schedule on save** — saving a habit schedules its local reminder(s) and stores the returned notification identifier(s).                            | `scheduleNotificationAsync`                                      |
| 4   | **Edit / delete** — editing reschedules (cancel old IDs, schedule new); deleting cancels its reminders only (not all).                               | `cancelScheduledNotificationAsync(id)` — NOTES Ex. 13            |
| 5   | **Mark done + streak** — tapping "Done" for today increments a streak counter; missing a day resets it.                                              | app logic                                                        |
| 6   | **Deep link on tap** — tapping a reminder opens that habit's detail screen via the hidden `data` payload.                                            | `data` + `addNotificationResponseReceivedListener` — NOTES Ex. 3 |
| 7   | **Foreground handler** — reminders are visible even while the app is open.                                                                           | `setNotificationHandler`                                         |
| 8   | **Android channel** — reminders go through a custom HIGH-importance channel; explain in your writeup why it must exist before requesting permission. | NOTES Ex. 11 + PUSH-NOTES §3                                     |
| 9   | **Permission flow** — request once, show a banner/empty-state if denied, with a button to open system settings.                                      | `requestPermissionsAsync`                                        |


## 2. Push requirements (needs a dev build)


| #   | Requirement                                                                                                                                                                       | Concept       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 10  | **Register + show token** — display the `ExpoPushToken` and let the user copy it.                                                                                                 | PUSH-NOTES §3 |
| 11  | **Streak nudge push** — send a push (from `expo.dev/notifications`, cURL, or a tiny Node script) whose `data` deep-links to a habit — **reuse the exact same tap handler as #6**. | PUSH-NOTES §4 |
| 12  | **Foreground vs background** — demonstrate (screenshots/video) the same push arriving with the app open vs closed, and explain the difference.                                    | PUSH-NOTES §2 |


## 3. Stretch goals (bonus marks)

- **Snooze action** — iOS action buttons ("Done" / "Snooze 10 min"); Snooze reschedules a one-off reminder (NOTES Ex. 10).
- **Badge = today's pending habits** — keep the app-icon badge in sync (NOTES Ex. 5).
- **Image push** — send an FCM `imageUrl` push and explain why a *big image* is push-only on Android (NOTES Ex. 8 table).
- **Tiny send server** — a `expo-server-sdk` Node script that reads tokens and sends a daily "you have N habits today" push; handle the `DeviceNotRegistered` receipt by dropping the token (PUSH-NOTES §4).
- **Quiet hours** — let the user set a "do not disturb" window and skip scheduling in it.

---

## 4. Suggested architecture (you may adapt)

```
src/
  app/
    index.tsx          # Today: list of habits + done buttons + streaks
    habit/[id].tsx     # Habit detail (deep-link target for #6 and #11)
    new.tsx            # Create / edit habit form
    settings.tsx       # Permissions, push token, quiet hours
  lib/
    habits/storage.ts  # CRUD + persistence (AsyncStorage / sqlite)
    habits/types.ts    # Habit, Frequency, etc.
    notifications/
      setup.ts         # handler, channel, permission helper  (already exists)
      schedule.ts      # scheduleHabit(habit) -> ids, cancelHabit(ids)
      push.ts          # register + send  (already exists)
  hooks/
    use-habits.ts
    use-push-notifications.ts   # already exists
```

> The repo already has `setup.ts`, `push.ts`, and the Push tab — reuse them, don't rewrite.

### Data model hint

```ts
type Frequency =
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; weekdays: number[]; hour: number; minute: number };

type Habit = {
  id: string;
  name: string;        // "Drink water"
  emoji: string;       // "💧"
  frequency: Frequency;
  notificationIds: string[];   // returned by scheduleNotificationAsync — needed to cancel
  streak: number;
  lastCompletedISO: string | null;
};
```

The `data` payload that powers both local (#6) and push (#11) deep-linking:

```ts
content: {
  title: 'Time to drink water 💧',
  body: 'Tap to log it.',
  data: { screen: '/habit', habitId: habit.id },   // <- the contract
}
```

---

## 5. What to submit

1. The app source (a dev build APK/link is a plus).
2. A short **writeup (≈1 page)** answering:
  - Why didn't my custom sound/icon work in Expo Go?
  - Why must the Android channel exist **before** requesting permission?
  - What's the difference between a push **ticket** and a **receipt**, and what does `DeviceNotRegistered` mean for your server?
  - When should a feature be a **local** notification vs a **push**? Give one example of each from your app and justify it.
3. **Evidence**: screenshots or a short screen recording showing
  (a) a scheduled reminder firing, (b) tapping it deep-links to the habit,
   (c) a push doing the same thing, and (d) the foreground vs background difference.

---

## 6. Grading (100 pts)


| Area                                                                            | Pts             |
| ------------------------------------------------------------------------------- | --------------- |
| Core req. 1–9 working (incl. persistence + deep link)                           | 50              |
| Push req. 10–12 (real send + deep link reuse)                                   | 25              |
| Code quality / architecture (side-effects isolated, no crashes on denied perms) | 10              |
| Writeup (conceptual understanding)                                              | 15              |
| Stretch goals                                                                   | up to +15 bonus |


**Auto-fail traps** (from the notes' "Common mistakes" tables — don't fall for these):

- Deleting a habit calls `cancelAllScheduledNotificationsAsync()` (nukes everyone else's reminders) instead of cancelling only its own IDs.
- No foreground handler → "nothing happens" when the app is open.
- Treating a push **ticket** `ok` as proof of delivery.
- Push code shipped that sends directly from the app with a hard-coded token (sending is a **server** job — PUSH-NOTES §4 warning).

---

## 7. Milestones (suggested 1-week plan)

1. **Day 1–2:** habit CRUD + persistence + list UI (no notifications yet).
2. **Day 3:** schedule/cancel local reminders on save/delete; foreground handler + channel.
3. **Day 4:** deep-linking on tap (#6) + streak logic.
4. **Day 5:** dev build; push register + show token; send a deep-linking push (#11–12).
5. **Day 6:** stretch goals + writeup + record evidence.

