import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';

import { BACKEND_URL, DEVICE_API_KEY } from '@/lib/config';
import { getExpoPushToken } from '@/lib/notifications/push';

/** Silently registers the device token with the backend. Fire-and-forget. */
async function registerWithBackend(token: string): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': DEVICE_API_KEY,
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Non-fatal — registration will succeed on next launch or when connectivity returns.
  }
}

export function usePushNotifications() {
  const [token, setToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('checking…');

  async function refresh() {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
    if (status === 'granted') {
      const t = await getExpoPushToken();
      if (t) {
        setToken(t);
        // Auto-register with the Vercel backend every time we have a valid token.
        // The backend stores tokens in Redis (idempotent — re-adding is safe).
        registerWithBackend(t);
      }
    }
  }

  useEffect(() => { refresh(); }, []);

  return { token, permissionStatus, refresh };
}
