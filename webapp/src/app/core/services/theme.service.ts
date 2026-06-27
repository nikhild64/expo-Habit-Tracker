import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { ACCENT_PRESETS, type AccentId, type ThemeMode } from '../models/theme';
import { STORAGE_KEYS, StorageService } from './storage.service';

const FREE_ACCENTS: AccentId[] = ACCENT_PRESETS.filter(a => a.free).map(a => a.id);

/**
 * ThemeService — port of src/contexts/ThemeContext.tsx.
 *
 * Single source of truth for `theme` ('dark' | 'light') and `accent` (one of
 * the 8 AccentIds). The two values are reflected onto the root `<html>`
 * element via `data-theme` and `data-accent` attributes so SCSS tokens in
 * tokens.scss can re-style the whole UI without re-rendering any component.
 *
 * Persists changes through StorageService → IndexedDB. The legacy mobile
 * key names (`theme_v1`, `accent_v1`, `accents_unlocked_v1`) are reused
 * verbatim so the JSON full-backup format round-trips between platforms.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);

  /** Default theme is dark to match the mobile app + the SSR-rendered HTML. */
  readonly theme = signal<ThemeMode>('dark');
  readonly accent = signal<AccentId>('orange');
  readonly unlockedAccents = signal<AccentId[]>(FREE_ACCENTS);

  readonly isDark = computed(() => this.theme() === 'dark');
  readonly isAccentUnlocked = (id: AccentId) =>
    computed(() => this.unlockedAccents().includes(id));

  /** Flag that flips true after the first IndexedDB load resolves. */
  readonly ready = signal(false);

  constructor() {
    this.load();

    // Reflect every change onto <html> so the SCSS variables update live.
    effect(() => {
      const root = this.document.documentElement;
      root.setAttribute('data-theme', this.theme());
      root.setAttribute('data-accent', this.accent());
    });
  }

  private async load(): Promise<void> {
    const [, themeRaw] = (await this.storage.multiGet<string>([STORAGE_KEYS.theme]))[0];
    const [, accentRaw] = (await this.storage.multiGet<string>([STORAGE_KEYS.accent]))[0];
    const [, unlockedRaw] = (await this.storage.multiGet<AccentId[]>([STORAGE_KEYS.accentsUnlocked]))[0];

    if (themeRaw === 'dark' || themeRaw === 'light') this.theme.set(themeRaw);
    if (typeof accentRaw === 'string' && ACCENT_PRESETS.some(a => a.id === accentRaw)) {
      this.accent.set(accentRaw as AccentId);
    }
    if (Array.isArray(unlockedRaw)) {
      const merged = Array.from(new Set<AccentId>([...FREE_ACCENTS, ...unlockedRaw]));
      this.unlockedAccents.set(merged);
    }
    this.ready.set(true);
  }

  toggleTheme(): void {
    const next: ThemeMode = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    void this.storage.setItem(STORAGE_KEYS.theme, next);
  }

  setAccent(id: AccentId): void {
    this.accent.set(id);
    void this.storage.setItem(STORAGE_KEYS.accent, id);
  }

  async unlockAccent(id: AccentId): Promise<void> {
    const current = this.unlockedAccents();
    if (current.includes(id)) return;
    const next = [...current, id];
    this.unlockedAccents.set(next);
    await this.storage.setItem(STORAGE_KEYS.accentsUnlocked, next);
  }
}
