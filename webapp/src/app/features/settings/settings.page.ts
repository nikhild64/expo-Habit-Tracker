import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { ACCENT_PRESETS, type AccentId } from '../../core/models/theme';
import { ExportService } from '../../core/services/export.service';
import { HabitsService } from '../../core/services/habits.service';
import { ImportService } from '../../core/services/import.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { PushTokenService } from '../../core/services/push-token.service';
import { QuietHoursService } from '../../core/services/quiet-hours.service';
import { StorageService } from '../../core/services/storage.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { formatTime } from '../../core/utils/format.util';
import { buildDummyHabits } from '../../core/utils/seed.util';
import { ClockFaceComponent } from '../../shared/components/clock-face/clock-face.component';
import { ConfirmationComponent } from '../../shared/components/confirmation/confirmation.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';
import { SheetComponent } from '../../shared/components/sheet/sheet.component';

const APP_VERSION = '1.0.0';

type ConfirmConfig = {
  title: string;
  message?: string;
  icon: string;
  iconColor: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

/**
 * Settings screen — port of src/app/(tabs)/settings.tsx.
 *
 * Sections (every one of these ships in this file):
 *  - Appearance (Dark Mode toggle + Accent Color disks)
 *  - Insights & Reviews
 *  - Privacy (App Lock row)
 *  - Notifications (permission state + request)
 *  - Quiet Hours (DND toggle + Start/End time pills opening ClockFace)
 *  - Push Token (HIDDEN — easter egg)
 *  - About (3 rows + version row that's the easter-egg trigger)
 *  - Developer Tools (HIDDEN — easter egg) — Load Dummy / Clear All
 *  - Archived Habits (conditional — Restore + Trash per row)
 *  - Data (CSV / JSON / Import / Full Backup / Restore — wired to stubs)
 *  - Danger Zone (Reset App)
 *
 * Easter egg: tap the Version row 5x in 10 s to flip `showDevTools` true.
 * The flag gates the Push Token + Developer Tools sections.
 */
@Component({
  selector: 'app-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClockFaceComponent,
    ConfirmationComponent,
    IoniconComponent,
    SheetComponent,
  ],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export default class SettingsPage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly quietHours = inject(QuietHoursService);
  private readonly notifications = inject(NotificationsService);
  private readonly pushToken = inject(PushTokenService);
  private readonly habitsService = inject(HabitsService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly onboarding = inject(OnboardingService);
  private readonly exportSvc = inject(ExportService);
  private readonly importSvc = inject(ImportService);
  private readonly platformId = inject(PLATFORM_ID);

  // ── Theme ────────────────────────────────────────────────────────────
  protected readonly isDark = this.theme.isDark;
  protected readonly currentAccent = this.theme.accent;
  protected readonly unlockedAccents = this.theme.unlockedAccents;
  protected readonly accentPresets = ACCENT_PRESETS;

  // ── Notifications ────────────────────────────────────────────────────
  protected readonly permission = this.notifications.permission;
  protected readonly granted = computed(() => this.permission() === 'granted');
  protected readonly denied = computed(() => this.permission() === 'denied');
  protected readonly undetermined = computed(() =>
    this.permission() !== 'granted' && this.permission() !== 'denied',
  );

  protected readonly permIcon = computed(() =>
    this.granted() ? 'notifications'
      : this.denied() ? 'notifications-off'
        : 'notifications-outline',
  );
  protected readonly permColor = computed(() =>
    this.granted() ? 'var(--color-done)'
      : this.denied() ? 'var(--color-danger)'
        : 'var(--color-streak)',
  );
  protected readonly permLabel = computed(() =>
    this.granted() ? 'Enabled' : this.denied() ? 'Denied' : 'Not determined',
  );

  // ── Quiet hours ──────────────────────────────────────────────────────
  protected readonly qh = this.quietHours.value;

  protected readonly startTimeLabel = computed(() =>
    formatTime(this.qh().startHour, this.qh().startMinute),
  );
  protected readonly endTimeLabel = computed(() =>
    formatTime(this.qh().endHour, this.qh().endMinute),
  );

  // ── Time picker state ────────────────────────────────────────────────
  protected readonly activePicker = signal<'start' | 'end' | null>(null);
  protected readonly pickerHour = signal(0);
  protected readonly pickerMinute = signal(0);

  protected readonly pickerLabel = computed(() =>
    formatTime(this.pickerHour(), this.pickerMinute()),
  );

  // ── Push token easter egg ────────────────────────────────────────────
  protected readonly showDevTools = signal(false);
  protected readonly versionTapHint = signal('');
  private versionTapCount = 0;
  private versionTapTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly subId = this.pushToken.subId;
  protected readonly version = APP_VERSION;
  protected readonly isBrowser = isPlatformBrowser(this.platformId);

  protected readonly versionText = computed(() => {
    if (this.versionTapHint()) return this.versionTapHint();
    return this.showDevTools() ? `${this.version} ●` : this.version;
  });

  // ── Archived habits ──────────────────────────────────────────────────
  protected readonly archived = this.habitsService.archivedHabits;

  // ── Data section loading flags ───────────────────────────────────────
  protected readonly dataLoading = signal<
    'csv' | 'json' | 'import' | 'backup' | 'restore' | null
  >(null);

  // ── Modal state (Confirmation) ───────────────────────────────────────
  protected readonly confirmConfig = signal<ConfirmConfig | null>(null);

  // ── Lifecycle ────────────────────────────────────────────────────────
  ngOnDestroy(): void {
    if (this.versionTapTimer) clearTimeout(this.versionTapTimer);
  }

  // ── Navigation ───────────────────────────────────────────────────────
  protected navigate(path: string, queryParams?: Record<string, unknown>): void {
    if (queryParams) {
      void this.router.navigate([path], { queryParams });
    } else {
      void this.router.navigate([path]);
    }
  }

  // ── Theme ────────────────────────────────────────────────────────────
  protected toggleTheme(): void {
    this.theme.toggleTheme();
  }

  protected onAccentPress(id: AccentId): void {
    if (this.unlockedAccents().includes(id)) {
      this.theme.setAccent(id);
      return;
    }
    const preset = this.accentPresets.find(p => p.id === id);
    this.confirmConfig.set({
      title: `${preset?.label ?? 'Accent'} accent`,
      message:
        'Unlock this accent in the Cosmetics Shop with coins earned from completing habits.',
      icon: 'color-palette-outline',
      iconColor: preset?.tint ?? 'var(--color-tint)',
      confirmLabel: 'Visit Shop',
      cancelLabel: 'Cancel',
      onConfirm: () => this.navigate('/shop'),
    });
  }

  protected accentDisplay(id: AccentId): { tint: string; locked: boolean; active: boolean } {
    const preset = this.accentPresets.find(p => p.id === id)!;
    return {
      tint: preset.tint,
      locked: !this.unlockedAccents().includes(id),
      active: this.currentAccent() === id,
    };
  }

  // ── Notifications ────────────────────────────────────────────────────
  protected async requestNotifications(): Promise<void> {
    const next = await this.notifications.requestPermission();
    if (next === 'denied') {
      this.openPermGuide();
    }
  }

  protected openPermGuide(): void {
    this.confirmConfig.set({
      title: 'Notifications blocked',
      message:
        'Open your browser Site Settings → Notifications and switch Habitly to Allow. iOS Safari: Settings → Safari → Notifications.',
      icon: 'notifications-off-outline',
      iconColor: 'var(--color-danger)',
      confirmLabel: 'Got it',
      cancelLabel: 'Close',
      onConfirm: () => {},
    });
  }

  // ── Quiet hours ──────────────────────────────────────────────────────
  protected toggleDnd(): void {
    void this.quietHours.update({ enabled: !this.qh().enabled });
  }

  protected openTimePicker(which: 'start' | 'end'): void {
    if (!this.qh().enabled) return;
    if (which === 'start') {
      this.pickerHour.set(this.qh().startHour);
      this.pickerMinute.set(this.qh().startMinute);
    } else {
      this.pickerHour.set(this.qh().endHour);
      this.pickerMinute.set(this.qh().endMinute);
    }
    this.activePicker.set(which);
  }

  protected onPickerHour(h: number): void {
    this.pickerHour.set(h);
  }

  protected onPickerMinute(m: number): void {
    this.pickerMinute.set(m);
  }

  protected async confirmPicker(): Promise<void> {
    const which = this.activePicker();
    if (which === 'start') {
      await this.quietHours.update({
        startHour: this.pickerHour(),
        startMinute: this.pickerMinute(),
      });
    } else if (which === 'end') {
      await this.quietHours.update({
        endHour: this.pickerHour(),
        endMinute: this.pickerMinute(),
      });
    }
    this.activePicker.set(null);
  }

  protected closeTimePicker(): void {
    this.activePicker.set(null);
  }

  // ── Easter egg ───────────────────────────────────────────────────────
  protected onVersionTap(): void {
    this.versionTapCount += 1;
    const remaining = 5 - this.versionTapCount;

    if (this.versionTapTimer) clearTimeout(this.versionTapTimer);

    if (this.versionTapCount >= 5) {
      this.versionTapCount = 0;
      this.versionTapHint.set('');
      this.showDevTools.update(v => !v);
    } else {
      this.versionTapHint.set(remaining === 1 ? 'One more…' : `${remaining} more taps`);
      this.versionTapTimer = setTimeout(() => {
        this.versionTapCount = 0;
        this.versionTapHint.set('');
      }, 10_000);
    }
  }

  protected async copyToken(): Promise<void> {
    const t = this.subId();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      this.toast.success('Push token copied');
    } catch {
      this.toast.error('Copy failed');
    }
  }

  // ── Archived habits ──────────────────────────────────────────────────
  protected async restoreArchived(id: string): Promise<void> {
    await this.habitsService.restoreHabit(id);
  }

  protected confirmDeleteArchived(id: string, name: string): void {
    this.confirmConfig.set({
      title: 'Delete habit',
      message: `Permanently delete "${name}"? This cannot be undone.`,
      icon: 'trash-outline',
      iconColor: 'var(--color-danger)',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: () => {
        void this.habitsService.deleteHabit(id);
      },
    });
  }

  // ── Data section ─────────────────────────────────────────────────────
  protected async exportCsv(): Promise<void> {
    this.dataLoading.set('csv');
    try {
      await this.exportSvc.exportCsv(this.habitsService.habits());
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      this.dataLoading.set(null);
    }
  }

  protected async exportJson(): Promise<void> {
    this.dataLoading.set('json');
    try {
      await this.exportSvc.exportJson(this.habitsService.habits());
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      this.dataLoading.set(null);
    }
  }

  protected async exportFullBackup(): Promise<void> {
    this.dataLoading.set('backup');
    try {
      await this.exportSvc.exportFullBackup();
      this.toast.success('Backup exported');
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Backup failed');
    } finally {
      this.dataLoading.set(null);
    }
  }

  protected async importHabits(): Promise<void> {
    this.dataLoading.set('import');
    try {
      const picked = await this.importSvc.pickAndImportHabits();
      if (!picked) return; // User cancelled the picker — silent no-op.
      const result = await this.habitsService.importHabits(picked);
      const skippedSuffix = result.skipped > 0
        ? `, skipped ${result.skipped} duplicate${result.skipped !== 1 ? 's' : ''}`
        : '';
      this.toast.success(
        `Added ${result.added} habit${result.added !== 1 ? 's' : ''}${skippedSuffix}`,
      );
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      this.dataLoading.set(null);
    }
  }

  protected confirmRestoreBackup(): void {
    this.confirmConfig.set({
      title: 'Restore from Backup?',
      message:
        'This will overwrite your current habits, routines, profile, mood, and theme. Are you sure?',
      icon: 'cloud-upload-outline',
      iconColor: '#14B8A6',
      confirmLabel: 'Restore',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: () => void this.restoreBackup(),
    });
  }

  private async restoreBackup(): Promise<void> {
    this.dataLoading.set('restore');
    try {
      const result = await this.importSvc.pickAndRestoreFullBackup();
      if (!result) return; // User cancelled the picker — silent no-op.
      this.toast.success(`Restored: ${result.restored.join(', ')}`);
      if (typeof window !== 'undefined') window.location.reload();
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      this.dataLoading.set(null);
    }
  }

  // ── Developer Tools ──────────────────────────────────────────────────
  protected confirmLoadDummy(): void {
    this.confirmConfig.set({
      title: 'Load Dummy Data',
      message:
        'This replaces all your habits with 5 seed habits covering 5 months of streak history. The app will reload automatically.',
      icon: 'flask-outline',
      iconColor: '#F97316',
      confirmLabel: 'Load & Reload',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        const habits = buildDummyHabits();
        await this.storage.setItem('habits_v2', habits);
        await this.habitsService.loadFresh();
        if (typeof window !== 'undefined') window.location.reload();
      },
    });
  }

  protected confirmClearAll(): void {
    this.confirmConfig.set({
      title: 'Clear All Habits',
      message: 'Removes all habits from storage and reloads. Use this to reset after testing.',
      icon: 'trash-bin-outline',
      iconColor: 'var(--color-danger)',
      confirmLabel: 'Clear & Reload',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        await this.storage.removeItem('habits_v2');
        await this.habitsService.loadFresh();
        if (typeof window !== 'undefined') window.location.reload();
      },
    });
  }

  // ── Danger zone (Reset App) ──────────────────────────────────────────
  protected confirmResetApp(): void {
    this.confirmConfig.set({
      title: 'Reset App',
      message:
        'This will delete all habits, streaks, settings, and quiet hours. The app will restart from the beginning.',
      icon: 'trash-outline',
      iconColor: 'var(--color-danger)',
      confirmLabel: 'Reset Everything',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: () => void this.resetApp(),
    });
  }

  private async resetApp(): Promise<void> {
    await this.storage.clear();
    await this.onboarding.reset();
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => false)));
    }
    void this.router.navigate(['/onboarding']);
    if (typeof window !== 'undefined') window.location.href = '/onboarding';
  }

  // ── Confirmation modal handlers ──────────────────────────────────────
  protected dismissConfirm(): void {
    this.confirmConfig.set(null);
  }

  protected onConfirmConfirmed(): void {
    const cfg = this.confirmConfig();
    cfg?.onConfirm();
    this.confirmConfig.set(null);
  }
}
