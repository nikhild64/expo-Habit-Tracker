import { Injectable, inject, signal } from '@angular/core';

import { ENV } from '../config/environment';
import { QuietHoursService } from './quiet-hours.service';
import { STORAGE_KEYS, StorageService } from './storage.service';

export type ReminderSlot = {
  id: string;
  hour: number;
  minute: number;
  /** Expo convention: 1=Sun..7=Sat. Omit/empty = every day. */
  weekdays?: number[];
  title: string;
  body: string;
  data?: { screen?: string; habitId?: string | null };
};

/**
 * PushTokenService — owns the PWA's Web Push subscription lifecycle.
 *
 * Responsibilities:
 *  - Fetch the backend's VAPID public key (`GET /web/vapid`).
 *  - Call `pushManager.subscribe()` against the active SW registration
 *    when the user has granted notification permission.
 *  - Register / unregister the subscription with the backend
 *    (`POST /web/register`, `POST /web/unregister`).
 *  - Replace the per-sub reminder schedule (`POST /web/schedule`) whenever
 *    the user's habits change — driven from a signal `effect()` in
 *    `NotificationsService.linkToHabitsService()`.
 *  - Trigger snooze pushes from the client side
 *    (`POST /api/snooze`) so the SW's snooze action can postMessage to a
 *    focused client and let the page do the authenticated call.
 *
 * Lifecycle:
 *   - `load()` runs on construction and re-hydrates the persisted subId
 *     from IDB so the Settings → Push Token easter egg shows the value on
 *     the first paint after a hard reload.
 *   - The actual PushManager subscription is best obtained right after
 *     `Notification.requestPermission()` returns 'granted' — call
 *     `ensureSubscription()` from `NotificationsService.requestPermission()`.
 *
 * iOS notes:
 *   - `pushManager.subscribe()` is only exposed when the PWA is added to
 *     the Home Screen (`display: standalone`). In a regular Safari tab it
 *     throws — we guard with `'PushManager' in window` and a
 *     `navigator.standalone` hint, falling back to a no-op.
 */
@Injectable({ providedIn: 'root' })
export class PushTokenService {
  private readonly storage = inject(StorageService);
  private readonly quietHoursService = inject(QuietHoursService);

  /** Backend-derived id (first 16 hex chars of sha256(endpoint)) — exposed via Settings easter egg. */
  readonly subId = signal<string | null>(null);
  /** True once the persisted subId has been read from IDB (regardless of whether one exists). */
  readonly ready = signal(false);
  /** The active PushSubscription object — null until `ensureSubscription()` succeeds. */
  readonly subscription = signal<PushSubscription | null>(null);

  /** Cached VAPID public key — fetched once, reused for re-subscribes. */
  private vapidKey: string | null = null;
  /** Backend base URL (kept as instance member so tests can swap it via DI). */
  readonly backendUrl = ENV.backendUrl;

  constructor() {
    void this.load();
  }

  // ── Persistence ────────────────────────────────────────────────────────

  private async load(): Promise<void> {
    const saved = await this.storage.getItem<string>(STORAGE_KEYS.pushSubId);
    if (typeof saved === 'string' && saved.length > 0) {
      this.subId.set(saved);
    }
    this.ready.set(true);
    // Re-hydrate the live subscription object (if any) so callers can
    // immediately call `syncSchedule()` without waiting for the next
    // permission re-grant.
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          this.subscription.set(sub);
          if (!this.subId()) {
            this.subId.set(await this.deriveSubId(sub.endpoint));
          }
        }
      } catch {
        // SW may not be registered yet — that's fine, we'll subscribe on demand.
      }
    }
  }

  /** Manually persist a subId. Kept for completeness — `ensureSubscription()` calls this internally. */
  async setSubId(id: string): Promise<void> {
    this.subId.set(id);
    await this.storage.setItem(STORAGE_KEYS.pushSubId, id);
  }

  async clear(): Promise<void> {
    this.subId.set(null);
    this.subscription.set(null);
    await this.storage.removeItem(STORAGE_KEYS.pushSubId);
  }

  // ── Subscription lifecycle ─────────────────────────────────────────────

  /**
   * Idempotently subscribe to Web Push + register with the backend.
   * Returns the live PushSubscription, or null when:
   *   - The runtime doesn't expose PushManager.
   *   - Notification permission is not 'granted'.
   *   - VAPID is not configured server-side (publicKey is null).
   *   - The subscribe call throws (browser blocked / iOS not standalone).
   */
  async ensureSubscription(): Promise<PushSubscription | null> {
    if (typeof window === 'undefined') return null;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    if (typeof Notification === 'undefined') return null;
    if (Notification.permission !== 'granted') return null;

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        const publicKey = await this.fetchVapidKey();
        if (!publicKey) return null;
        // The Uint8Array's buffer is widened to ArrayBufferLike under TS 5.7+,
        // which doesn't match the `BufferSource` signature on
        // `PushSubscriptionOptionsInit`. Cast through `BufferSource` so we
        // stay correct under both narrow + wide buffer types.
        const key = this.urlBase64ToUint8Array(publicKey) as unknown as BufferSource;
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      }

      // POST /web/register — idempotent on the backend (SADD into a set).
      await this.postJson('/web/register', { subscription: sub.toJSON() });

      this.subscription.set(sub);
      const id = await this.deriveSubId(sub.endpoint);
      await this.setSubId(id);
      return sub;
    } catch (e) {
      console.warn('[push] ensureSubscription failed', e);
      return null;
    }
  }

  /**
   * Replace the per-sub server-side reminder schedule. Called whenever the
   * habit list changes (see `NotificationsService.linkToHabitsService()`).
   * Sends the user's quiet-hours + timezone offset so the cron tick fires
   * at the right local time even if the user is travelling.
   */
  async syncSchedule(slots: ReminderSlot[]): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    const quietHours = this.quietHoursService.value();
    const body = {
      subscription: sub.toJSON(),
      slots,
      quietHours,
      // Positive = ahead of UTC (the backend uses this directly).
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
    };
    try {
      await this.postJson('/web/schedule', body);
    } catch (e) {
      console.warn('[push] syncSchedule failed', e);
    }
  }

  /**
   * Server-side snooze — called by the app when the SW posts a SNOOZE_HABIT
   * message (it can't authenticate the POST itself). Best-effort: silently
   * swallows errors so a denied snooze doesn't surface a scary error toast.
   */
  async snooze(habitId: string, minutes = 10): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    try {
      await this.postJson('/api/snooze', {
        subscription: sub.toJSON(),
        habitId,
        minutes,
      });
    } catch (e) {
      console.warn('[push] snooze failed', e);
    }
  }

  /** Tear down the subscription + tell the backend to forget about us. */
  async unsubscribe(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    try {
      await this.postJson('/web/unregister', { subscription: sub.toJSON() });
    } catch {
      // Continue with the local cleanup even if the backend call fails.
    }
    try {
      await sub.unsubscribe();
    } catch {
      // Already revoked — ignore.
    }
    this.subscription.set(null);
    await this.clear();
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async fetchVapidKey(): Promise<string | null> {
    if (this.vapidKey) return this.vapidKey;
    try {
      const res = await fetch(`${this.backendUrl}/web/vapid`, { method: 'GET' });
      if (!res.ok) return null;
      const json = (await res.json()) as { publicKey?: string | null };
      this.vapidKey = json.publicKey ?? null;
      return this.vapidKey;
    } catch (e) {
      console.warn('[push] fetchVapidKey failed', e);
      return null;
    }
  }

  private async postJson(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.backendUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': ENV.deviceKey,
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Decode a URL-safe base64 VAPID public key into the Uint8Array shape
   * required by `pushManager.subscribe({ applicationServerKey })`.
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  /**
   * Mirrors the backend's `subIdFromEndpoint`:
   *   `crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16)`
   */
  private async deriveSubId(endpoint: string): Promise<string> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      // SSR / very old browsers — return a stable but non-cryptographic hash.
      let h = 0;
      for (let i = 0; i < endpoint.length; i++) {
        h = ((h << 5) - h + endpoint.charCodeAt(i)) | 0;
      }
      return Math.abs(h).toString(16).padStart(16, '0').slice(0, 16);
    }
    const buf = new TextEncoder().encode(endpoint);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(hashBuf);
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    return hex.slice(0, 16);
  }
}
