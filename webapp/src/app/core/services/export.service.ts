import { Injectable, inject } from '@angular/core';

import type { Habit } from '../models/habit';
import { STORAGE_KEYS, StorageService } from './storage.service';

const BACKUP_SCHEMA_VERSION = 2;

/**
 * ExportService — port of `exportToCSV` / `exportToJSON` / `exportFullBackup`
 * from src/lib/habits/export.ts in the mobile app.
 *
 * The output schemas are byte-identical so a backup exported from either
 * platform can be restored on the other (see ImportService).
 *
 * Download strategy (in priority order):
 *  1. Web Share API with `files: [File]` — preferred on iOS PWA where it
 *     surfaces the system share sheet (Save to Files, AirDrop, Mail…).
 *  2. Anchor element with `download` attribute + an object URL — the
 *     fallback every browser supports.
 *
 * `URL.createObjectURL()` is revoked after a short delay (5 s) so a user
 * who immediately closes the share sheet still gets their file written.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly storage = inject(StorageService);

  // ── Public entrypoints ─────────────────────────────────────────────────

  async exportCsv(habits: Habit[]): Promise<void> {
    const csv = this.buildCsv(habits);
    await this.download(`habitly-habits-${this.today()}.csv`, csv, 'text/csv');
  }

  async exportJson(habits: Habit[]): Promise<void> {
    const json = JSON.stringify(habits, null, 2);
    await this.download(`habitly-habits-${this.today()}.json`, json, 'application/json');
  }

  async exportFullBackup(): Promise<void> {
    const [habits, routines, profile, moodEntries, quietHours, theme, accent, unlockedAccents] =
      await Promise.all([
        this.storage.getItem<unknown>(STORAGE_KEYS.habits),
        this.storage.getItem<unknown>(STORAGE_KEYS.routines),
        this.storage.getItem<unknown>(STORAGE_KEYS.profile),
        this.storage.getItem<unknown>(STORAGE_KEYS.moodEntries),
        this.storage.getItem<unknown>(STORAGE_KEYS.quietHours),
        this.storage.getItem<string>(STORAGE_KEYS.theme),
        this.storage.getItem<string>(STORAGE_KEYS.accent),
        this.storage.getItem<string[]>(STORAGE_KEYS.accentsUnlocked),
      ]);

    const backup = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      habits,
      routines,
      profile,
      moodEntries,
      quietHours,
      theme: {
        theme: theme ?? undefined,
        accent: accent ?? undefined,
        unlockedAccents: unlockedAccents ?? undefined,
      },
    };

    const json = JSON.stringify(backup, null, 2);
    await this.download(`habitly-backup-${this.today()}.json`, json, 'application/json');
  }

  // ── Internals ──────────────────────────────────────────────────────────

  /** Mirrors `exportToCSV` from src/lib/habits/export.ts. */
  private buildCsv(habits: Habit[]): string {
    const rows: string[] = ['name,category,date,completed,note,streak'];

    for (const habit of habits) {
      const dates = new Set<string>([
        ...(habit.completions ?? []),
        ...Object.keys(habit.notes ?? {}),
      ]);

      if (dates.size === 0) {
        rows.push([
          this.escapeCsv(habit.name),
          this.escapeCsv(habit.category ?? 'Other'),
          '',
          '',
          '',
          String(habit.streak ?? 0),
        ].join(','));
        continue;
      }

      for (const date of [...dates].sort()) {
        const completed = (habit.completions ?? []).includes(date);
        const note = habit.notes?.[date] ?? '';
        rows.push([
          this.escapeCsv(habit.name),
          this.escapeCsv(habit.category ?? 'Other'),
          date,
          completed ? 'true' : 'false',
          this.escapeCsv(note),
          String(habit.streak ?? 0),
        ].join(','));
      }
    }

    return rows.join('\n');
  }

  private escapeCsv(value: string): string {
    if (/[,"\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async download(filename: string, content: string, mime: string): Promise<void> {
    if (typeof window === 'undefined') return;
    const blob = new Blob([content], { type: mime });

    // Try the Web Share API first (best UX on iOS PWA — surfaces the
    // native share sheet so the user can Save to Files / AirDrop / Mail).
    try {
      const file = new File([blob], filename, { type: mime });
      const nav = navigator as Navigator & {
        canShare?: (data?: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string }) => Promise<void>;
      };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return;
      }
    } catch {
      // User cancelled the share sheet, or the platform rejected the call.
      // Either way, fall through to the anchor-download fallback.
    }

    this.fallbackDownload(blob, filename);
  }

  private fallbackDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Defer revoke so Safari has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
