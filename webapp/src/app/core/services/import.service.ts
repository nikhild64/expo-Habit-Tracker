import { Injectable, inject } from '@angular/core';

import type { Habit } from '../models/habit';
import { STORAGE_KEYS, StorageService } from './storage.service';

/**
 * Old-format full-backup shape we still accept on import (mirrors
 * `pickFullBackup` in src/lib/habits/export.ts).
 */
type FullBackup = {
  schemaVersion?: number;
  exportedAt?: string;
  habits?: Habit[];
  routines?: unknown;
  profile?: unknown;
  moodEntries?: unknown;
  quietHours?: unknown;
  theme?: {
    theme?: string;
    accent?: string;
    unlockedAccents?: string[];
  };
};

/**
 * ImportService — opens a `<input type=file>` picker, validates the
 * chosen JSON (or bare habit array), and either returns the parsed
 * habits to the caller (`pickAndImportHabits`) or restores the full
 * backup directly to IndexedDB (`pickAndRestoreFullBackup`).
 *
 * Schemas are 1:1 with src/lib/habits/export.ts so files produced by the
 * mobile app import cleanly here, and vice versa.
 *
 * Returns `null` when the user cancels the picker (Settings treats that
 * as a silent no-op). Throws an Error with a human-readable message on
 * validation failure so the caller can surface it via ToastService.
 */
@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly storage = inject(StorageService);

  // ── Habits-only import ────────────────────────────────────────────────

  /**
   * Picks a JSON file and returns the validated habit array — the
   * caller is expected to feed that into `HabitsService.importHabits()`
   * so the merge + dedupe rules stay in one place.
   *
   * Returns `null` when the user cancels.
   */
  async pickAndImportHabits(): Promise<Habit[] | null> {
    const file = await this.pickFile('application/json,.json');
    if (!file) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }

    // Accept both the legacy bare-array export and a full backup shape
    // (in which case we just pull out the `habits` field).
    let habits: unknown[];
    if (Array.isArray(parsed)) {
      habits = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as FullBackup).habits)) {
      habits = (parsed as FullBackup).habits!;
    } else {
      throw new Error('Invalid format: expected a JSON array of habits.');
    }

    const valid = habits.filter((h): h is Habit => {
      if (!h || typeof h !== 'object') return false;
      const rec = h as Record<string, unknown>;
      return typeof rec['id'] === 'string' && typeof rec['name'] === 'string';
    });

    if (valid.length === 0) {
      throw new Error('No valid habits found in the file.');
    }

    return valid;
  }

  // ── Full backup restore ───────────────────────────────────────────────

  /**
   * Picks a JSON backup file, validates it, and overwrites every
   * available section in IndexedDB. Returns the list of restored
   * sections (suitable for a toast: "Restored: 12 habits, routines,
   * profile (XP, coins, achievements), …").
   *
   * Returns `null` when the user cancels.
   */
  async pickAndRestoreFullBackup(): Promise<{ restored: string[] } | null> {
    const file = await this.pickFile('application/json,.json');
    if (!file) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }

    // Backwards compatibility — bare array of habits is treated as a v1
    // backup (mirrors `pickFullBackup` in src/lib/habits/export.ts).
    let backup: FullBackup;
    if (Array.isArray(parsed)) {
      backup = { schemaVersion: 1, habits: parsed as Habit[] };
    } else if (parsed && typeof parsed === 'object') {
      backup = parsed as FullBackup;
    } else {
      throw new Error('Unrecognised backup format.');
    }

    if (!Array.isArray(backup.habits)) {
      throw new Error('Backup is missing the required "habits" array.');
    }

    const restored: string[] = [];

    await this.storage.setItem(STORAGE_KEYS.habits, backup.habits);
    restored.push(`${backup.habits.length} habit${backup.habits.length === 1 ? '' : 's'}`);

    if (backup.routines !== undefined) {
      await this.storage.setItem(STORAGE_KEYS.routines, backup.routines);
      restored.push('routines');
    }
    if (backup.profile !== undefined) {
      await this.storage.setItem(STORAGE_KEYS.profile, backup.profile);
      restored.push('profile (XP, coins, achievements)');
    }
    if (backup.moodEntries !== undefined) {
      await this.storage.setItem(STORAGE_KEYS.moodEntries, backup.moodEntries);
      restored.push('mood & journal');
    }
    if (backup.quietHours !== undefined) {
      await this.storage.setItem(STORAGE_KEYS.quietHours, backup.quietHours);
      restored.push('quiet hours');
    }
    if (backup.theme) {
      const themeSaved =
        backup.theme.theme === 'dark' || backup.theme.theme === 'light';
      if (themeSaved) {
        await this.storage.setItem(STORAGE_KEYS.theme, backup.theme.theme);
      }
      if (typeof backup.theme.accent === 'string') {
        await this.storage.setItem(STORAGE_KEYS.accent, backup.theme.accent);
      }
      if (Array.isArray(backup.theme.unlockedAccents)) {
        await this.storage.setItem(STORAGE_KEYS.accentsUnlocked, backup.theme.unlockedAccents);
      }
      if (themeSaved || backup.theme.accent || backup.theme.unlockedAccents) {
        restored.push('theme & accents');
      }
    }

    return { restored };
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private pickFile(accept: string): Promise<File | null> {
    return new Promise(resolve => {
      if (typeof document === 'undefined') {
        resolve(null);
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.position = 'fixed';
      input.style.top = '-1000px';
      input.style.left = '-1000px';

      let settled = false;
      const finish = (file: File | null) => {
        if (settled) return;
        settled = true;
        try { document.body.removeChild(input); } catch { /* already removed */ }
        resolve(file);
      };

      input.onchange = () => {
        finish(input.files?.[0] ?? null);
      };

      // Detect cancellation — focus returns to window without `change`
      // firing. The `cancel` event is the cleanest signal (Chrome 113+,
      // Safari 17+); we also fall back to a polling check on `body.focus`.
      input.addEventListener('cancel', () => finish(null));
      const onFocus = () => {
        // Defer so a change event has time to fire first.
        setTimeout(() => finish(null), 800);
        window.removeEventListener('focus', onFocus);
      };
      window.addEventListener('focus', onFocus);

      document.body.appendChild(input);
      input.click();
    });
  }
}
