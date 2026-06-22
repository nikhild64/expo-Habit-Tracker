import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Expo } from "expo-server-sdk";

dotenv.config();

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

// accessToken is only needed if you enabled enhanced push security on your Expo account.
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  useFcmV1: true,
});

// In-memory token store. Swap for a real database (Postgres/Mongo/Redis) in production.
const pushTokens = new Set();

/**
 * The app calls this on launch to register the device's Expo push token.
 */
app.post("/register", (req, res) => {
  const { token } = req.body ?? {};

  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ error: "Invalid or missing Expo push token" });
  }

  pushTokens.add(token);
  console.log(`Registered token (${pushTokens.size} total):`, token);
  return res.json({ success: true, count: pushTokens.size });
});

/**
 * Removes a token (e.g. on logout or when a receipt reports DeviceNotRegistered).
 */
app.post("/unregister", (req, res) => {
  const { token } = req.body ?? {};
  pushTokens.delete(token);
  return res.json({ success: true, count: pushTokens.size });
});

/**
 * Sends a notification to every registered device.
 * Body: { title?, body?, data? }
 */
app.post("/send", async (req, res) => {
  const { title, body, data } = req.body ?? {};

  if (pushTokens.size === 0) {
    return res.status(400).json({ error: "No registered devices to send to" });
  }

  const messages = [];
  for (const pushToken of pushTokens) {
    if (!Expo.isExpoPushToken(pushToken)) continue;
    messages.push({
      to: pushToken,
      sound: "default",
      title: title || "Hello",
      body: body || "This is a test notification",
      data: data || {},
    });
  }

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  try {
    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    }
  } catch (error) {
    console.error("Error sending push notifications:", error);
    return res.status(500).json({ error: "Failed to send notifications" });
  }

  // Fire-and-forget receipt check ~15s later to prune dead tokens.
  setTimeout(() => checkReceipts(tickets).catch(console.error), 15_000);

  return res.json({ success: true, sent: messages.length, tickets });
});

/**
 * Polls the Expo service for delivery receipts and removes tokens that
 * Apple/Google report as no longer valid.
 */
async function checkReceipts(tickets) {
  const receiptIds = tickets
    .filter((t) => t.status === "ok" && t.id)
    .map((t) => t.id);

  if (receiptIds.length === 0) return;

  const idChunks = expo.chunkPushNotificationReceiptIds(receiptIds);

  for (const chunk of idChunks) {
    const receipts = await expo.getPushNotificationReceiptsAsync(chunk);

    for (const [receiptId, receipt] of Object.entries(receipts)) {
      if (receipt.status === "error") {
        console.error(`Receipt ${receiptId} error: ${receipt.message}`);
        if (receipt.details?.error === "DeviceNotRegistered") {
          // We don't have the token mapped to the receipt here; in a real DB
          // you'd store ticket.id -> token to remove the exact one.
          console.warn("A device is no longer registered. Prune it from your store.");
        }
      }
    }
  }
}

app.get("/", (_req, res) => {
  res.json({ status: "ok", registeredDevices: pushTokens.size });
});

app.listen(PORT, () => {
  console.log(`Push backend running on http://localhost:${PORT}`);
});
