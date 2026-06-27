/**
 * App-lock preferences — port of src/contexts/AppLockContext.tsx (type half).
 */
export type LockPrefs = {
  enabled: boolean;
  /** Seconds the PWA can be hidden before re-locking. */
  autoLockSeconds: number;
  /** Use WebAuthn passkey when available; falls back to PIN. */
  biometricEnabled: boolean;
  /**
   * Base64URL-encoded WebAuthn credential id from the registered passkey.
   * Used as `allowCredentials[0].id` when verifying. `null` when no passkey
   * is registered yet (or the user disabled biometric).
   */
  biometricCredentialId: string | null;
};

export const DEFAULT_LOCK_PREFS: LockPrefs = {
  enabled: false,
  autoLockSeconds: 30,
  biometricEnabled: true,
  biometricCredentialId: null,
};
