import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Button, Platform, StyleSheet, Text, View } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Use your machine's LAN IP (e.g. http://192.168.1.20:4000) when testing on a
// physical device. "localhost" only works in the web/emulator on the same host.
const BACKEND_URL = "http://localhost:4000";

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  if (!Device.isDevice) {
    console.warn("Push notifications require a physical device.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    console.warn("Permission for push notifications was denied.");
    return null;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  if (!projectId) {
    console.warn("Project ID not found in app config.");
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return token;
}

export default function Index() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    registerForPushNotificationsAsync()
      .then(async (t) => {
        if (!t) {
          setStatus("Could not get a push token (see logs).");
          return;
        }
        setToken(t);
        try {
          const res = await fetch(`${BACKEND_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: t }),
          });
          setStatus(res.ok ? "Registered with backend." : "Backend rejected token.");
        } catch {
          setStatus("Could not reach backend.");
        }
      })
      .catch((e) => setStatus(String(e)));
  }, []);

  async function triggerServerPush() {
    try {
      await fetch(`${BACKEND_URL}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "From the server",
          body: "Your Node.js backend sent this.",
          data: { source: "push-backend" },
        }),
      });
      setStatus("Asked backend to send a push.");
    } catch {
      setStatus("Could not reach backend.");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Expo push token</Text>
      <Text selectable style={styles.token}>
        {token ?? "registering..."}
      </Text>
      <Button title="Trigger push from server" onPress={triggerServerPush} />
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  label: {
    fontWeight: "600",
  },
  token: {
    textAlign: "center",
    fontSize: 12,
  },
  status: {
    color: "#208AEF",
  },
});
