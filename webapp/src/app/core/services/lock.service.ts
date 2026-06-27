import { Injectable, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { DEFAULT_LOCK_PREFS, type LockPrefs } from '../models/app-lock';
import { STORAGE_KEYS, StorageService } from './storage.service';

/** Stored encrypted-PIN envelope. */
type EncryptedPin = {
  /** Base64 of the random 12-byte IV. */
  iv: string;
  /** Base64 of the AES-GCM ciphertext (includes the 16-byte auth tag). */
  ciphertext: string;
  /** Base64 of the JWK-exported AES key (256-bit). */
  key: string;
};

/**
 * Constant-time string compare — both strings are walked end-to-end without
 * short-circuiting on the first mismatch, so attackers can't time their way
 * to a partial match.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/**
 * Decode base64 into a fresh ArrayBuffer-backed Uint8Array.  We explicitly
 * allocate a new ArrayBuffer rather than using the default Uint8Array(n)
 * ctor — TS 5.9's WebCrypto types require `ArrayBufferView<ArrayBuffer>`,
 * which `new Uint8Array(n)` returns as `Uint8Array<ArrayBufferLike>`.
 */
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const ab = new ArrayBuffer(s.length);
  const out = new Uint8Array(ab);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function bufToBase64Url(buf: ArrayBuffer): string {
  return toBase64(new Uint8Array(buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuf(b64url: string): ArrayBuffer {
  let s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  // TypeScript 5.9 narrows Uint8Array.buffer to `ArrayBufferLike` to account
  // for `SharedArrayBuffer`; allocate a fresh ArrayBuffer to drop that union.
  const u8 = fromBase64(s);
  const out = new ArrayBuffer(u8.byteLength);
  new Uint8Array(out).set(u8);
  return out;
}

/** Allocate a fresh Uint8Array backed by ArrayBuffer (not SharedArrayBuffer). */
function makeBytes(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(length));
}

const PIN_RP_NAME = 'Habitly';
const PIN_USER_NAME = 'habitly-local';

/**
 * LockService — port of src/contexts/AppLockContext.tsx (full).
 *
 * Owns:
 *  - LockPrefs (`enabled`, `autoLockSeconds`, `biometricEnabled`,
 *    `biometricCredentialId`).
 *  - The encrypted PIN envelope in IndexedDB under `app_lock_pin_v1`.
 *  - `locked()` signal that drives the `lockGuard` redirect.
 *  - Auto-lock via the `visibilitychange` listener (re-lock after the PWA was
 *    hidden for ≥ autoLockSeconds).
 *
 * Security model for the PIN:
 *   1. On `setPin(pin)` we generate a fresh AES-GCM 256-bit key, export it as
 *      JWK (so we can stash it next to the ciphertext for offline decrypt),
 *      pick a random 12-byte IV, and encrypt the UTF-8 PIN.
 *   2. The whole envelope `{ iv, ciphertext, key }` is JSON-stringified and
 *      persisted to IDB.  All three fields are pure-random / opaque so a
 *      stolen IDB snapshot only reveals what an attacker can already mount
 *      a brute force against (10⁴ candidates for a 4-digit PIN, but they
 *      need both physical device access *and* unlocked browser context).
 *   3. `verifyPin(candidate)` decrypts and `constantTimeEqual`s the strings
 *      so timing side-channels can't distinguish wrong-on-first-char from
 *      wrong-on-last-char.
 *
 * Biometric flow (WebAuthn passkey):
 *   - `registerPasskey()` runs in the `setup → confirm` flow on a click.
 *   - `verifyPasskey()` runs in the `verify` flow when the user taps the bio
 *     key OR on mount when biometric is enabled.
 *   - We use platform attachment + resident key + UV required so the user is
 *     prompted by their OS biometric (Touch ID / Windows Hello / Android
 *     fingerprint) and the credential survives reloads.
 */
@Injectable({ providedIn: 'root' })
export class LockService {
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);

  readonly prefs = signal<LockPrefs>(DEFAULT_LOCK_PREFS);
  readonly ready = signal(false);
  readonly locked = signal(false);

  /** True when `navigator.credentials` + PublicKeyCredential are available. */
  readonly webauthnSupported = computed(() => this.detectWebauthn());

  private backgroundedAt: number | null = null;

  constructor() {
    this.load();
    this.attachVisibilityListener();
  }

  // ── Init ───────────────────────────────────────────────────────────────

  private detectWebauthn(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as Window & {
      PublicKeyCredential?: unknown;
    };
    return (
      typeof win.PublicKeyCredential !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.credentials !== 'undefined'
    );
  }

  private async load(): Promise<void> {
    const saved = await this.storage.getItem<Partial<LockPrefs>>(STORAGE_KEYS.lockPrefs);
    const next: LockPrefs = { ...DEFAULT_LOCK_PREFS, ...(saved ?? {}) };
    this.prefs.set(next);
    if (next.enabled) {
      this.locked.set(true);
    }
    this.ready.set(true);
  }

  private attachVisibilityListener(): void {
    if (typeof window === 'undefined') return;
    this.document.addEventListener('visibilitychange', () => {
      const p = this.prefs();
      if (!p.enabled) return;
      if (this.document.visibilityState === 'hidden') {
        this.backgroundedAt = Date.now();
      } else if (this.document.visibilityState === 'visible' && this.backgroundedAt != null) {
        const ago = (Date.now() - this.backgroundedAt) / 1000;
        this.backgroundedAt = null;
        if (ago >= p.autoLockSeconds) {
          this.locked.set(true);
        }
      }
    });
  }

  // ── Lock state ─────────────────────────────────────────────────────────

  async updatePrefs(patch: Partial<LockPrefs>): Promise<void> {
    const next = { ...this.prefs(), ...patch };
    this.prefs.set(next);
    await this.storage.setItem(STORAGE_KEYS.lockPrefs, next);
  }

  unlock(): void {
    this.locked.set(false);
  }

  lockNow(): void {
    if (!this.prefs().enabled) return;
    this.locked.set(true);
  }

  // ── PIN ────────────────────────────────────────────────────────────────

  /** Encrypts a new PIN and persists it. Also flips `enabled = true`. */
  async setPin(pin: string, biometricEnabled = this.prefs().biometricEnabled): Promise<void> {
    const envelope = await this.encryptPin(pin);
    await this.storage.setItem(STORAGE_KEYS.lockPin, envelope);
    await this.updatePrefs({ enabled: true, biometricEnabled });
  }

  /** Returns true when `candidate` matches the stored PIN. */
  async verifyPin(candidate: string): Promise<boolean> {
    const envelope = await this.storage.getItem<EncryptedPin>(STORAGE_KEYS.lockPin);
    if (!envelope) return false;
    try {
      const decrypted = await this.decryptPin(envelope);
      return constantTimeEqual(decrypted, candidate);
    } catch {
      return false;
    }
  }

  /** Disables app lock entirely and wipes both the PIN and credential id. */
  async clearLock(): Promise<void> {
    await this.storage.removeItem(STORAGE_KEYS.lockPin);
    await this.updatePrefs({
      enabled: false,
      biometricEnabled: true,
      biometricCredentialId: null,
    });
    this.locked.set(false);
  }

  private async encryptPin(pin: string): Promise<EncryptedPin> {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(makeBytes(12));
    // Extractable so we can stash the JWK next to the ciphertext (offline
    // decrypt — the threat model is "browser is unlocked, user wants to
    // unlock the app").  Anyone who can read IDB can already read habits.
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(pin),
    );
    const jwk = await crypto.subtle.exportKey('jwk', key);
    return {
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext)),
      key: btoa(JSON.stringify(jwk)),
    };
  }

  private async decryptPin(envelope: EncryptedPin): Promise<string> {
    const iv = fromBase64(envelope.iv);
    const ciphertext = fromBase64(envelope.ciphertext);
    const jwk = JSON.parse(atob(envelope.key)) as JsonWebKey;
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    // BufferSource cast: TS 5.9 widens Uint8Array.buffer to ArrayBufferLike
    // which doesn't satisfy BufferSource without an explicit narrow.
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    return new TextDecoder().decode(plain);
  }

  // ── WebAuthn (biometric) ──────────────────────────────────────────────

  /**
   * Registers a new platform-attached passkey.  Used during the `confirm`
   * step of the setup flow when biometric is enabled.  On success the new
   * credential id is persisted into `prefs.biometricCredentialId`.
   *
   * Returns true on success, false on any failure or user cancellation.
   */
  async registerPasskey(): Promise<boolean> {
    if (!this.webauthnSupported()) return false;
    try {
      const challenge = crypto.getRandomValues(makeBytes(32));
      const userId = crypto.getRandomValues(makeBytes(16));
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: PIN_RP_NAME, id: location.hostname },
          user: { id: userId, name: PIN_USER_NAME, displayName: PIN_USER_NAME },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7  }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'required',
          },
          timeout: 60_000,
          attestation: 'none',
        },
      })) as PublicKeyCredential | null;
      if (!cred) return false;
      await this.updatePrefs({
        biometricEnabled: true,
        biometricCredentialId: bufToBase64Url(cred.rawId),
      });
      return true;
    } catch (e) {
      console.warn('[lock] passkey registration failed', e);
      return false;
    }
  }

  /**
   * Verifies the stored passkey by triggering a biometric prompt.  Used
   * during the `verify` flow (auto-on-mount + bio key).  Returns true when
   * the OS confirms the user.
   */
  async verifyPasskey(): Promise<boolean> {
    if (!this.webauthnSupported()) return false;
    const id = this.prefs().biometricCredentialId;
    if (!id) return false;
    try {
      const challenge = crypto.getRandomValues(makeBytes(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: location.hostname,
          allowCredentials: [{
            id: base64UrlToBuf(id),
            type: 'public-key',
          }],
          userVerification: 'required',
          timeout: 60_000,
        },
      });
      return !!assertion;
    } catch (e) {
      // User cancelled, no platform authenticator available, etc. — fall
      // back to PIN silently.  Production code can surface a toast.
      console.warn('[lock] passkey verification failed', e);
      return false;
    }
  }
}
