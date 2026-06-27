import { Injectable } from '@angular/core';
import {
  clear as idbClear,
  del as idbDel,
  get as idbGet,
  keys as idbKeys,
  set as idbSet,
  createStore,
  type UseStore,
} from 'idb-keyval';

/**
 * Storage namespaces — mirror the AsyncStorage namespaces used by the
 * mobile app (src/lib/habits/storage.ts STORAGE_KEY etc.), with the leading
 * `@` stripped because IndexedDB key names should not start with `@` in
 * every browser implementation.
 *
 * Keeping the SAME `_v` suffix lets users JSON-export from the mobile app
 * and JSON-import into the PWA (see §8 of the plan, Settings → Data).
 */
export const STORAGE_KEYS = {
  habits: 'habits_v2',
  routines: 'routines_v1',
  profile: 'profile_v1',
  moodEntries: 'mood_v1',
  quietHours: 'quiet_hours_v1',
  theme: 'theme_v1',
  accent: 'accent_v1',
  accentsUnlocked: 'accents_unlocked_v1',
  onboarding: 'onboarding_v1',
  lockPrefs: 'app_lock_prefs_v1',
  lockPin: 'app_lock_pin_v1',
  quests: 'quests_v1',
  pushSubId: 'push_sub_id_v1',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS] | (string & { _brand?: never });

/**
 * StorageService — thin AsyncStorage-shaped wrapper around idb-keyval.
 *
 * Why a single `kv` store instead of a per-namespace IndexedDB schema?
 *   - idb-keyval already does the IDB plumbing well.
 *   - One store keeps the migration from the mobile app's AsyncStorage
 *     trivially 1:1 (string key → JSON-serialised value, same as the
 *     React Native call site).
 *   - When/if a feature outgrows the kv pattern (large blobs, secondary
 *     indexes), it can graduate to its own dedicated store via createStore.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  /** Single IndexedDB database + object store: `habitly` / `kv`. */
  private readonly store: UseStore;

  constructor() {
    // SSR / Node test environment: idb-keyval gracefully falls back to a
    // module-level Map when indexedDB is undefined, but we still create our
    // own store so the database name is consistent in DevTools.
    this.store = createStore('habitly', 'kv');
  }

  /** Reads and JSON-parses a value. Returns `null` if the key is unset. */
  async getItem<T>(key: StorageKey): Promise<T | null> {
    try {
      const raw = await idbGet<string | undefined>(key as string, this.store);
      if (raw === undefined || raw === null) return null;
      // Plain strings (theme, accent, onboarding) are stored verbatim.
      // Trying JSON.parse on a non-JSON string returns the raw string.
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    } catch (e) {
      console.error('[storage] getItem failed for', key, e);
      return null;
    }
  }

  /** Writes a value. Non-string values are JSON-stringified. */
  async setItem<T>(key: StorageKey, value: T): Promise<void> {
    try {
      const serialised = typeof value === 'string'
        ? (value as string)
        : JSON.stringify(value);
      await idbSet(key as string, serialised, this.store);
    } catch (e) {
      console.error('[storage] setItem failed for', key, e);
    }
  }

  /** Reads multiple keys at once. Returns `[key, value | null][]`. */
  async multiGet<T = unknown>(keys: StorageKey[]): Promise<[string, T | null][]> {
    const results = await Promise.all(keys.map(k => this.getItem<T>(k)));
    return keys.map((k, i) => [k as string, results[i]]);
  }

  /** Writes multiple `[key, value]` pairs atomically (per-key not transactional). */
  async multiSet(items: Array<[StorageKey, unknown]>): Promise<void> {
    await Promise.all(items.map(([k, v]) => this.setItem(k, v)));
  }

  async removeItem(key: StorageKey): Promise<void> {
    try {
      await idbDel(key as string, this.store);
    } catch (e) {
      console.error('[storage] removeItem failed for', key, e);
    }
  }

  /** Lists every key currently stored — used by Settings → Reset App. */
  async listKeys(): Promise<string[]> {
    try {
      return (await idbKeys(this.store)) as string[];
    } catch {
      return [];
    }
  }

  /** Wipes the entire kv store. Used by Settings → Reset App. */
  async clear(): Promise<void> {
    try {
      await idbClear(this.store);
    } catch (e) {
      console.error('[storage] clear failed', e);
    }
  }
}
