import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

const LOCK_PREFS_KEY = '@app_lock_prefs_v1';
const PIN_SECURE_KEY = 'habitly_app_pin';

type LockPrefs = {
  enabled: boolean;
  /** Seconds the app can be in the background before re-locking. */
  autoLockSeconds: number;
  /** Use biometric to unlock instead of typing PIN. */
  biometricEnabled: boolean;
};

const DEFAULT_PREFS: LockPrefs = {
  enabled: false,
  autoLockSeconds: 30,
  biometricEnabled: true,
};

type AppLockContextValue = {
  prefs: LockPrefs;
  ready: boolean;
  /** True when the app is currently locked and the lock screen should be shown. */
  locked: boolean;
  /** Mark the session unlocked (called by the lock screen on successful auth). */
  unlock: () => void;
  /** Manually re-lock (e.g. from Settings). */
  lockNow: () => void;
  /** Save / update preferences. */
  updatePrefs: (patch: Partial<LockPrefs>) => Promise<void>;
  /** Save (or update) a 4-digit PIN. */
  setPin: (pin: string) => Promise<void>;
  /** Verify a typed PIN. */
  verifyPin: (pin: string) => Promise<boolean>;
  /** Clear stored PIN + disable lock. */
  clearLock: () => Promise<void>;
  /** Trigger biometric prompt. */
  tryBiometric: () => Promise<boolean>;
};

const AppLockContext = createContext<AppLockContextValue>({
  prefs: DEFAULT_PREFS,
  ready: false,
  locked: false,
  unlock: () => {},
  lockNow: () => {},
  updatePrefs: async () => {},
  setPin: async () => {},
  verifyPin: async () => false,
  clearLock: async () => {},
  tryBiometric: async () => false,
});

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<LockPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);
  const prefsRef = useRef<LockPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    AsyncStorage.getItem(LOCK_PREFS_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
          setPrefsState(parsed);
          prefsRef.current = parsed;
          // If lock is enabled, start in locked state
          if (parsed.enabled) {
            setLocked(true);
            router.replace('/lock' as never);
          }
        } catch { /* ignore */ }
      }
      setReady(true);
    });
  }, []);

  // Auto-lock on background → foreground when timeout exceeded
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      const p = prefsRef.current;
      if (!p.enabled) return;
      if (state === 'background' || state === 'inactive') {
        backgroundedAtRef.current = Date.now();
      } else if (state === 'active' && backgroundedAtRef.current != null) {
        const ago = (Date.now() - backgroundedAtRef.current) / 1000;
        backgroundedAtRef.current = null;
        if (ago >= p.autoLockSeconds) {
          setLocked(true);
          router.replace('/lock' as never);
        }
      }
    });
    return () => sub.remove();
  }, []);

  const updatePrefs = useCallback(async (patch: Partial<LockPrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefsState(next);
    await AsyncStorage.setItem(LOCK_PREFS_KEY, JSON.stringify(next));
  }, []);

  const setPin = useCallback(async (pin: string) => {
    // Store the PIN protected by hardware keychain. Biometric requirement is
    // optional — if user has biometrics enabled, OS will gate any future read.
    const canBio = await SecureStore.canUseBiometricAuthentication();
    await SecureStore.setItemAsync(PIN_SECURE_KEY, pin, {
      requireAuthentication: canBio && prefsRef.current.biometricEnabled,
    });
    await updatePrefs({ enabled: true });
  }, [updatePrefs]);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const stored = await SecureStore.getItemAsync(PIN_SECURE_KEY, {
        requireAuthentication: false,
      });
      return stored === pin;
    } catch {
      return false;
    }
  }, []);

  const tryBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) return false;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Habitly',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    }
  }, []);

  const clearLock = useCallback(async () => {
    await SecureStore.deleteItemAsync(PIN_SECURE_KEY).catch(() => null);
    await updatePrefs({ enabled: false });
    setLocked(false);
  }, [updatePrefs]);

  const unlock = useCallback(() => setLocked(false), []);
  const lockNow = useCallback(() => {
    if (!prefsRef.current.enabled) return;
    setLocked(true);
    router.replace('/lock' as never);
  }, []);

  return (
    <AppLockContext.Provider
      value={{ prefs, ready, locked, unlock, lockNow, updatePrefs, setPin, verifyPin, clearLock, tryBiometric }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  return useContext(AppLockContext);
}
