import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import type { Habit } from '../../core/models/habit';
import { GamificationService } from '../../core/services/gamification.service';
import { HabitsService } from '../../core/services/habits.service';
import { ToastService } from '../../core/services/toast.service';
import { toDateKey } from '../../core/utils/dates.util';
import { XP_COMPLETE_HABIT } from '../../core/utils/gamification.util';
import {
  analyzeReminderEffectiveness,
  type ReminderSuggestion,
} from '../../core/utils/smart-reminders.util';
import { computeHabitStats } from '../../core/utils/stats.util';
import { isDoneToday } from '../../core/utils/streak.util';
import {
  BottomSheetComponent,
} from '../../shared/components/bottom-sheet/bottom-sheet.component';
import {
  ConfirmationComponent,
} from '../../shared/components/confirmation/confirmation.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatJournalDate(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFrequencyFull(habit: Habit): string {
  const f      = habit.frequency;
  const h      = f.hour % 12 || 12;
  const m      = f.minute.toString().padStart(2, '0');
  const period = f.hour >= 12 ? 'PM' : 'AM';
  const time   = `${h}:${m} ${period}`;
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  switch (f.kind) {
    case 'daily':    return `Every day at ${time}`;
    case 'weekly':   return `${f.weekdays.map(d => DAY_NAMES[d - 1]).join(', ')} at ${time}`;
    case 'weekdays': return `Monday to Friday at ${time}`;
    case 'weekends': return `Saturday & Sunday at ${time}`;
    case 'xperweek': return `${f.count} times per week at ${time}`;
    case 'interval': return `Every ${f.days} days at ${time}`;
    default:         return `at ${time}`;
  }
}

type CalendarCell = {
  day: number | null;
  key: string;
  isToday: boolean;
  isCompleted: boolean;
};

type CalendarWeek = CalendarCell[];

type ConfirmConfig = {
  title: string;
  message: string;
  icon: string;
  iconColor: string;
  confirmLabel: string;
  destructive: boolean;
  action: () => void | Promise<void>;
};

/**
 * HabitDetailPage — port of src/app/habit/[id].tsx.
 *
 * Top-down composition:
 *  - Header (back + Edit pill → /new?edit=:id)
 *  - Identity (88px badge + name 26/700 + formatFrequencyFull(habit))
 *  - 3-cell stats row (current/best/started)
 *  - Paused banner when status=paused
 *  - Mark-as-done button (XP awarded on first toggle)
 *  - Streak callout when streak > 1
 *  - Freeze callout when freeze used yesterday OR freezes available
 *  - Statistics block (only when completions >= 3, else empty state)
 *  - Smart Reminder banner via analyzeReminderEffectiveness()
 *  - Streak History mini-calendar with month nav
 *  - Journal section (most recent 30 completion dates → note edit sheet)
 *  - Actions card (Pause/Resume/Archive/Restore/Delete with Confirmation)
 */
@Component({
  selector: 'app-habit-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    IoniconComponent,
    BottomSheetComponent,
    ConfirmationComponent,
  ],
  templateUrl: './habit-detail.page.html',
  styleUrl: './habit-detail.page.scss',
})
export class HabitDetailPage {
  private readonly route   = inject(ActivatedRoute);
  private readonly router  = inject(Router);
  private readonly habits  = inject(HabitsService);
  private readonly gam     = inject(GamificationService);
  private readonly toast   = inject(ToastService);

  /** Resolved habit (or undefined when not found). */
  readonly habit = computed<Habit | undefined>(() => {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return undefined;
    return this.habits.habits().find(h => h.id === id);
  });

  readonly done = computed(() => {
    const h = this.habit();
    return h ? isDoneToday(h) : false;
  });

  readonly stats = computed(() => {
    const h = this.habit();
    if (!h) return null;
    return computeHabitStats(h.completions ?? [], h.createdAt, h.frequency);
  });

  readonly momentumColor = computed(() => {
    const s = this.stats();
    if (!s) return 'var(--color-text)';
    if (s.momentum >= 71) return 'var(--color-done)';
    if (s.momentum >= 41) return 'var(--color-streak)';
    return 'var(--color-danger)';
  });

  readonly reminderSuggestion = computed<ReminderSuggestion | null>(() => {
    const h = this.habit();
    return h ? analyzeReminderEffectiveness(h) : null;
  });

  readonly frequencyFull = computed(() => {
    const h = this.habit();
    return h ? formatFrequencyFull(h) : '';
  });

  readonly createdDate = computed(() => {
    const h = this.habit();
    if (!h) return '';
    return new Date(h.createdAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  });

  // ── Freeze callout ────────────────────────────────────────────────────
  readonly freezeCallout = computed<string | null>(() => {
    const h = this.habit();
    if (!h) return null;
    const freezes = h.freezesAvailable ?? 0;
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = toDateKey(d);
    const usedYest = (h.freezeUsedDates ?? []).includes(yesterday);
    if (!usedYest && freezes === 0) return null;
    if (usedYest) {
      return `Freeze used yesterday — streak protected · ${freezes} ${freezes === 1 ? 'token' : 'tokens'} left`;
    }
    return `${freezes} streak ${freezes === 1 ? 'freeze' : 'freezes'} available — ${freezes === 1 ? 'one' : freezes} missed day${freezes > 1 ? 's' : ''} covered`;
  });

  // ── Calendar state ────────────────────────────────────────────────────
  private readonly today = new Date();
  readonly viewYear  = signal(this.today.getFullYear());
  readonly viewMonth = signal(this.today.getMonth());

  readonly isCurrentMonth = computed(() =>
    this.viewYear() === this.today.getFullYear() && this.viewMonth() === this.today.getMonth(),
  );

  readonly isCreatedMonth = computed(() => {
    const h = this.habit();
    if (!h) return false;
    const created = new Date(h.createdAt);
    return this.viewYear() === created.getFullYear() && this.viewMonth() === created.getMonth();
  });

  readonly calendarTitle = computed(() =>
    `${MONTH_NAMES[this.viewMonth()]} ${this.viewYear()}`,
  );

  readonly weeks = computed<CalendarWeek[]>(() => {
    const h = this.habit();
    if (!h) return [];
    const y = this.viewYear();
    const m = this.viewMonth();
    const firstDOW = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayKey = toDateKey(this.today);
    const completedSet = new Set(h.completions ?? []);

    const cells: CalendarCell[] = [];
    for (let i = 0; i < firstDOW; i++) {
      cells.push({ day: null, key: `pad-${i}`, isToday: false, isCompleted: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const key = `${y}-${mm}-${dd}`;
      cells.push({
        day: d,
        key,
        isToday: key === todayKey,
        isCompleted: completedSet.has(key),
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, key: `pad-end-${cells.length}`, isToday: false, isCompleted: false });
    }
    const weeks: CalendarWeek[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  });

  readonly dowLabels = DOW_LABELS;

  navPrev(): void {
    if (this.isCreatedMonth()) return;
    if (this.viewMonth() === 0) {
      this.viewMonth.set(11);
      this.viewYear.update(y => y - 1);
    } else {
      this.viewMonth.update(m => m - 1);
    }
  }

  navNext(): void {
    if (this.isCurrentMonth()) return;
    if (this.viewMonth() === 11) {
      this.viewMonth.set(0);
      this.viewYear.update(y => y + 1);
    } else {
      this.viewMonth.update(m => m + 1);
    }
  }

  // ── Journal (note edit sheet) ─────────────────────────────────────────

  readonly journalEntries = computed(() => {
    const h = this.habit();
    if (!h) return [];
    const sorted = [...(h.completions ?? [])].sort((a, b) => b.localeCompare(a)).slice(0, 30);
    const notes = h.notes ?? {};
    return sorted.map(dateKey => ({
      dateKey,
      displayDate: formatJournalDate(dateKey),
      note: notes[dateKey] ?? '',
      hasNote: !!notes[dateKey],
    }));
  });

  readonly noteEdit = signal<{ date: string; text: string } | null>(null);
  readonly noteSheetTitle = computed(() => {
    const n = this.noteEdit();
    return n ? formatJournalDate(n.date) : '';
  });

  openNoteEdit(dateKey: string): void {
    const h = this.habit();
    const existing = h?.notes?.[dateKey] ?? '';
    this.noteEdit.set({ date: dateKey, text: existing });
  }

  closeNoteEdit(): void {
    this.noteEdit.set(null);
  }

  onNoteInput(e: Event): void {
    const text = (e.target as HTMLTextAreaElement).value;
    this.noteEdit.update(prev => (prev ? { ...prev, text } : null));
  }

  async saveNote(): Promise<void> {
    const n = this.noteEdit();
    const h = this.habit();
    if (!n || !h) return;
    await this.habits.addNote(h.id, n.date, n.text.trim());
    this.noteEdit.set(null);
  }

  // ── Confirmation (Pause / Archive / Restore / Delete / Smart reminder)

  readonly confirmConfig = signal<ConfirmConfig | null>(null);

  private askConfirm(cfg: ConfirmConfig): void {
    this.confirmConfig.set(cfg);
  }

  closeConfirm(): void {
    this.confirmConfig.set(null);
  }

  async runConfirm(): Promise<void> {
    const cfg = this.confirmConfig();
    if (!cfg) return;
    await cfg.action();
    this.confirmConfig.set(null);
  }

  // ── Top-bar actions ───────────────────────────────────────────────────

  goBack(): void {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/');
  }

  edit(): void {
    const h = this.habit();
    if (!h) return;
    this.router.navigate(['/new'], { queryParams: { edit: h.id } });
  }

  // ── Done button + XP ──────────────────────────────────────────────────

  async markDone(): Promise<void> {
    const h = this.habit();
    if (!h || h.status === 'paused' || this.done()) return;
    const result = await this.habits.markDone(h.id);
    if (result.wasAdded) {
      try {
        await this.gam.awardXP(XP_COMPLETE_HABIT, {}, this.habits.habits());
      } catch (e) {
        console.error('awardXP failed', e);
      }
    }
  }

  // ── Smart reminder banner action ──────────────────────────────────────

  applySmartReminder(): void {
    const h = this.habit();
    const s = this.reminderSuggestion();
    if (!h || !s) return;
    this.askConfirm({
      title: 'Update reminder time?',
      message: `You complete this habit ${Math.round(s.suggestedRate * 100)}% of the time when done by ${s.suggestedLabel}, vs ${Math.round(s.currentRate * 100)}% at your current ${s.currentLabel} reminder. Switch to ${s.suggestedLabel}?`,
      icon: 'bulb-outline',
      iconColor: '#7C3AED',
      confirmLabel: `Switch to ${s.suggestedLabel}`,
      destructive: false,
      action: async () => {
        await this.habits.updateHabit(h.id, {
          frequency: { ...h.frequency, hour: s.suggestedHour, minute: 0 } as typeof h.frequency,
        });
      },
    });
  }

  // ── Action card handlers ──────────────────────────────────────────────

  confirmPause(): void {
    const h = this.habit();
    if (!h) return;
    this.askConfirm({
      title: 'Pause habit',
      message: `Pause "${h.name}"? Notifications will be suspended and your streak won't decay.`,
      icon: 'pause-circle-outline',
      iconColor: '#EA580C',
      confirmLabel: 'Pause',
      destructive: false,
      action: async () => { await this.habits.pauseHabit(h.id); },
    });
  }

  resume(): void {
    const h = this.habit();
    if (!h) return;
    void this.habits.restoreHabit(h.id);
  }

  confirmArchive(): void {
    const h = this.habit();
    if (!h) return;
    this.askConfirm({
      title: 'Archive habit',
      message: `Archive "${h.name}"? It will be hidden but your history is preserved.`,
      icon: 'archive-outline',
      iconColor: 'var(--color-text-secondary)',
      confirmLabel: 'Archive',
      destructive: false,
      action: async () => {
        await this.habits.archiveHabit(h.id);
        this.goBack();
      },
    });
  }

  restoreFromArchive(): void {
    const h = this.habit();
    if (!h) return;
    void (async () => {
      await this.habits.restoreHabit(h.id);
      this.goBack();
    })();
  }

  confirmDelete(): void {
    const h = this.habit();
    if (!h) return;
    this.askConfirm({
      title: 'Delete habit',
      message: `Remove "${h.name}"? Your streak data will be lost.`,
      icon: 'trash-outline',
      iconColor: 'var(--color-danger)',
      confirmLabel: 'Delete',
      destructive: true,
      action: async () => {
        await this.habits.deleteHabit(h.id);
        this.goBack();
      },
    });
  }
}
