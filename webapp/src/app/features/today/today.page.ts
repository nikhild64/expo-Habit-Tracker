import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { CATEGORY_META } from '../../core/models/category';
import type { Habit, HabitCategory, TimeOfDay } from '../../core/models/habit';
import { BadgingService } from '../../core/services/badging.service';
import { GamificationService } from '../../core/services/gamification.service';
import { HabitsService } from '../../core/services/habits.service';
import { HapticsService } from '../../core/services/haptics.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { RoutinesService } from '../../core/services/routines.service';
import { ToastService } from '../../core/services/toast.service';
import { toDateKey } from '../../core/utils/dates.util';
import { currentTimeOfDay, TOD_META } from '../../core/utils/format.util';
import {
  XP_ALL_DONE_BONUS,
  XP_COMPLETE_HABIT,
  XP_STREAK_7,
} from '../../core/utils/gamification.util';
import { isDoneToday } from '../../core/utils/streak.util';
import { ShellComponent } from '../../layout/shell/shell.component';
import { ConfirmationComponent } from '../../shared/components/confirmation/confirmation.component';
import {
  ContextMenuComponent,
  type ContextMenuItem,
} from '../../shared/components/context-menu/context-menu.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';
import { ProgressRingComponent } from '../../shared/components/progress-ring/progress-ring.component';
import { SheetComponent } from '../../shared/components/sheet/sheet.component';
import { AutofocusDirective } from '../../shared/directives/autofocus.directive';
import { LongPressDirective } from '../../shared/directives/long-press.directive';
import {
  SwipeableDirective,
  type SwipeDirection,
} from '../../shared/directives/swipeable.directive';
import { HabitRowComponent } from './components/habit-row.component';
import { RoutineCardComponent } from './components/routine-card.component';
import { StreakPillComponent } from './components/streak-pill.component';

type ListItem =
  | { kind: 'section'; tod: TimeOfDay; id: string; count: number; done: number }
  | { kind: 'habit'; habit: Habit; id: string };

const TOD_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];

/**
 * Today screen — port of src/app/(tabs)/index.tsx (full implementation).
 *
 * Layout (top → bottom):
 *  1. Header (greeting + date + 38-px add button → /new)
 *  2. Permission-denied banner (when Notification.permission === 'denied')
 *  3. Refresh button (web replacement for pull-to-refresh)
 *  4. Progress card (84-px ProgressRing + title/sub + TOD breakdown bars +
 *     horizontal Active streaks rail) — only when there are habits
 *  5. Routines section (header with `+`, dashed empty stub OR list of
 *     RoutineCards)
 *  6. Category chip rail (only when >1 category present)
 *  7. CDK `cdkDropList` of grouped habits with TOD section headers; each
 *     habit row supports swipe-to-delete (5s undo via ToastService) and
 *     long-press → ContextMenu with 7 items.
 *  8. Empty state (2 CTAs) when there are no habits.
 *
 * After every completion commit:
 *  - `BadgingService.set(pendingCount)` from HabitsService.commit (already
 *    wired in the service).
 *  - "+10 XP earned" / "All done! +180 XP" toast via ToastService.
 *  - Confetti via `ShellComponent.triggerConfetti()` when allDoneNow.
 *  - NoteSheet (BottomSheet, autofocus textarea, Save/Skip) is opened so
 *    the user can capture a note for the completion.
 */
@Component({
  selector: 'app-today-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AutofocusDirective,
    ConfirmationComponent,
    ContextMenuComponent,
    DragDropModule,
    HabitRowComponent,
    IoniconComponent,
    LongPressDirective,
    ProgressRingComponent,
    RoutineCardComponent,
    SheetComponent,
    StreakPillComponent,
    SwipeableDirective,
  ],
  templateUrl: './today.page.html',
  styleUrl: './today.page.scss',
})
export default class TodayPage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly habitsService = inject(HabitsService);
  private readonly routinesService = inject(RoutinesService);
  private readonly gamification = inject(GamificationService);
  private readonly toast = inject(ToastService);
  private readonly notifications = inject(NotificationsService);
  private readonly haptics = inject(HapticsService);
  private readonly badging = inject(BadgingService);
  /**
   * Parent `ShellComponent` — used for `triggerConfetti()` when the last
   * remaining habit was just marked done. `optional: true` keeps the
   * component testable without the shell (Vitest harness etc.).
   */
  private readonly shell = inject(ShellComponent, { optional: true });

  // ── State ────────────────────────────────────────────────────────────
  protected readonly habits = this.habitsService.habits;
  protected readonly loading = this.habitsService.loading;
  protected readonly routines = this.routinesService.routines;
  protected readonly permissionState = this.notifications.permission;

  /** Habits soft-deleted but not yet committed (still in the 5-s undo window). */
  protected readonly pendingDeleteIds = signal<Set<string>>(new Set());
  private readonly pendingDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  protected readonly selectedCategory = signal<HabitCategory | 'All'>('All');

  // ── Note sheet state ────────────────────────────────────────────────
  protected readonly noteSheet = signal<{ habitId: string; date: string } | null>(null);
  protected readonly noteText = signal('');

  // ── Context menu state ──────────────────────────────────────────────
  protected readonly menuHabit = signal<Habit | null>(null);
  protected readonly menuItems = computed<ContextMenuItem[]>(() =>
    this.buildMenuItems(this.menuHabit()),
  );

  // ── Permission denial guidance modal ─────────────────────────────────
  protected readonly showPermGuide = signal(false);

  // ── Time-of-day reactive value (re-evaluates every 60 s) ────────────
  private readonly nowTick = signal(Date.now());
  private readonly nowInterval =
    typeof window !== 'undefined'
      ? setInterval(() => this.nowTick.set(Date.now()), 60_000)
      : null;

  protected readonly currentTOD = computed(() => {
    void this.nowTick();
    return currentTimeOfDay();
  });

  protected readonly greeting = computed(() => {
    void this.nowTick();
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  });

  protected readonly dateLabel = computed(() => {
    void this.nowTick();
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  });

  // ── Derived collections ─────────────────────────────────────────────
  protected readonly activeHabits = computed(() => {
    const pending = this.pendingDeleteIds();
    return this.habits().filter(
      h => (h.status ?? 'active') === 'active' && !pending.has(h.id),
    );
  });

  protected readonly doneCount = computed(
    () => this.activeHabits().filter(isDoneToday).length,
  );
  protected readonly total = computed(() => this.activeHabits().length);
  protected readonly progress = computed(() =>
    this.total() > 0 ? this.doneCount() / this.total() : 0,
  );
  protected readonly allDone = computed(
    () => this.total() > 0 && this.doneCount() === this.total(),
  );
  protected readonly progressLabel = computed(
    () => `${Math.round(this.progress() * 100)}%`,
  );
  protected readonly habitsWithStreak = computed(() =>
    this.activeHabits().filter(h => h.streak > 0),
  );

  protected readonly presentCategories = computed<HabitCategory[]>(() => {
    const seen = new Set<HabitCategory>();
    this.activeHabits().forEach(h => seen.add(h.category ?? 'Other'));
    return Array.from(seen);
  });

  protected readonly filteredHabits = computed<Habit[]>(() => {
    const sel = this.selectedCategory();
    return sel === 'All'
      ? this.activeHabits()
      : this.activeHabits().filter(h => (h.category ?? 'Other') === sel);
  });

  /** Flat list of section headers + habits in render order. */
  protected readonly listItems = computed<ListItem[]>(() => {
    const grouped: Record<TimeOfDay, Habit[]> = {
      morning: [], afternoon: [], evening: [], anytime: [],
    };
    for (const h of this.filteredHabits()) {
      grouped[h.timeOfDay ?? 'anytime'].push(h);
    }
    for (const tod of TOD_ORDER) {
      grouped[tod].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
    }
    const out: ListItem[] = [];
    for (const tod of TOD_ORDER) {
      const group = grouped[tod];
      if (group.length === 0) continue;
      const done = group.filter(isDoneToday).length;
      out.push({
        kind: 'section',
        tod,
        id: `sec_${tod}`,
        count: group.length,
        done,
      });
      for (const h of group) {
        out.push({ kind: 'habit', habit: h, id: h.id });
      }
    }
    return out;
  });

  /** TOD bars data — only non-empty TODs are shown. */
  protected readonly todBars = computed(() => {
    const groups: Record<TimeOfDay, Habit[]> = {
      morning: [], afternoon: [], evening: [], anytime: [],
    };
    for (const h of this.activeHabits()) {
      groups[h.timeOfDay ?? 'anytime'].push(h);
    }
    return TOD_ORDER
      .filter(t => groups[t].length > 0)
      .map(t => {
        const total = groups[t].length;
        const done = groups[t].filter(isDoneToday).length;
        return {
          tod: t,
          total,
          done,
          ratio: total > 0 ? done / total : 0,
          meta: TOD_META[t],
        };
      });
  });

  // ── App badge sync ───────────────────────────────────────────────────
  constructor() {
    // Keep the home-screen app badge in sync with the pending count even
    // when the user only edits via Today (the HabitsService.commit already
    // sets it; this is a belt-and-braces for the first paint).
    effect(() => {
      this.badging.set(this.habitsService.pendingCount());
    });
  }

  ngOnDestroy(): void {
    if (this.nowInterval) clearInterval(this.nowInterval);
    this.pendingDeleteTimers.forEach(t => clearTimeout(t));
    this.pendingDeleteTimers.clear();
  }

  // ── Navigation ───────────────────────────────────────────────────────
  protected goToNew(): void {
    this.router.navigate(['/new']);
  }
  protected goToNewRoutine(): void {
    this.router.navigate(['/new-routine']);
  }
  protected goToTemplates(): void {
    this.router.navigate(['/templates']);
  }
  protected openHabit(id: string): void {
    this.router.navigate(['/habit', id]);
  }
  protected openRoutine(id: string): void {
    this.router.navigate(['/routine', id]);
  }
  protected openTimer(id: string): void {
    this.router.navigate(['/timer', id]);
  }


  // ── Category chip ────────────────────────────────────────────────────
  protected getCategoryMeta(c: HabitCategory) {
    return CATEGORY_META[c];
  }

  protected onCategoryChip(c: HabitCategory): void {
    this.selectedCategory.set(this.selectedCategory() === c ? 'All' : c);
  }

  protected onAllChip(): void {
    this.selectedCategory.set('All');
  }

  // ── Permission banner ────────────────────────────────────────────────
  protected async onPermissionBanner(): Promise<void> {
    const state = await this.notifications.requestPermission();
    if (state === 'denied') {
      // Web has no `openSystemSettings`; surface a guidance modal.
      this.showPermGuide.set(true);
    }
  }

  // ── Drag-and-drop reorder ────────────────────────────────────────────
  protected onDrop(event: CdkDragDrop<ListItem[]>): void {
    const items = [...this.listItems()];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    const orderedHabitIds = items
      .filter((it): it is Extract<ListItem, { kind: 'habit' }> => it.kind === 'habit')
      .map(it => it.habit.id);
    this.haptics.selection();
    void this.habitsService.reorderHabits(orderedHabitIds);
  }

  /** Sections aren't draggable themselves — only habits drive reorders. */
  protected isHabitItem(item: ListItem): boolean {
    return item.kind === 'habit';
  }

  // ── Long-press → ContextMenu ─────────────────────────────────────────
  protected openContextMenu(habit: Habit): void {
    this.menuHabit.set(habit);
  }

  protected closeContextMenu(): void {
    this.menuHabit.set(null);
  }

  protected onMenuPick(item: ContextMenuItem): void {
    const id = item.id;
    const habit = this.menuHabit();
    if (!habit || !id) return;
    const todayKey = toDateKey(new Date());
    switch (id) {
      case 'toggle-done':
        void this.habitsService.markDone(habit.id);
        break;
      case 'toggle-skip':
        void this.habitsService.toggleSkipDay(habit.id, todayKey);
        break;
      case 'toggle-pin':
        void this.habitsService.togglePin(habit.id);
        break;
      case 'view-stats':
        this.openHabit(habit.id);
        break;
      case 'edit':
        this.router.navigate(['/new'], { queryParams: { edit: habit.id } });
        break;
      case 'archive':
        void this.habitsService.archiveHabit(habit.id);
        break;
      case 'delete':
        this.softDelete(habit);
        break;
    }
  }

  private buildMenuItems(habit: Habit | null): ContextMenuItem[] {
    if (!habit) return [];
    const todayKey = toDateKey(new Date());
    const isSkipped = (habit.skipDays ?? []).includes(todayKey);
    const isDone = isDoneToday(habit);
    return [
      {
        id: 'toggle-done',
        icon: isDone ? 'arrow-undo-outline' : 'checkmark-circle-outline',
        label: isDone ? 'Unmark today' : 'Mark done',
      },
      {
        id: 'toggle-skip',
        icon: isSkipped ? 'play-circle-outline' : 'pause-circle-outline',
        label: isSkipped ? 'Unskip today' : 'Skip today',
      },
      {
        id: 'toggle-pin',
        icon: habit.pinned ? 'bookmark' : 'bookmark-outline',
        label: habit.pinned ? 'Unpin' : 'Pin',
      },
      { id: 'view-stats', icon: 'stats-chart-outline', label: 'View stats' },
      { id: 'edit',       icon: 'create-outline',     label: 'Edit' },
      { id: 'archive',    icon: 'archive-outline',    label: 'Archive' },
      { id: 'delete',     icon: 'trash-outline',      label: 'Delete', destructive: true },
    ];
  }

  // ── Swipe-to-delete with 5-s undo ────────────────────────────────────
  protected onSwipeAction(direction: SwipeDirection, habit: Habit): void {
    // We only register `['left']` swipes (right→left reveal) so this is
    // always 'left'; the directive enforces the direction whitelist.
    if (direction !== 'left') return;
    this.softDelete(habit);
  }

  protected softDelete(habit: Habit): void {
    this.pendingDeleteIds.update(prev => {
      const next = new Set(prev);
      next.add(habit.id);
      return next;
    });
    const timer = setTimeout(() => {
      this.pendingDeleteTimers.delete(habit.id);
      void this.habitsService.deleteHabit(habit.id);
      this.pendingDeleteIds.update(prev => {
        const next = new Set(prev);
        next.delete(habit.id);
        return next;
      });
    }, 5000);
    this.pendingDeleteTimers.set(habit.id, timer);

    this.toast.info(`Deleted "${habit.name}"`, {
      actionLabel: 'Undo',
      duration: 5000,
      onAction: () => {
        const t = this.pendingDeleteTimers.get(habit.id);
        if (t) clearTimeout(t);
        this.pendingDeleteTimers.delete(habit.id);
        this.pendingDeleteIds.update(prev => {
          const next = new Set(prev);
          next.delete(habit.id);
          return next;
        });
      },
    });
  }

  // ── Pin toggle (from the row's bookmark) ─────────────────────────────
  protected onPin(habit: Habit): void {
    void this.habitsService.togglePin(habit.id);
  }

  // ── Primary completion action (type-aware) ───────────────────────────
  protected async onPrimary(habit: Habit): Promise<void> {
    this.haptics.light();

    if (habit.habitType === 'timed') {
      this.openTimer(habit.id);
      return;
    }

    const result = habit.habitType === 'quantitative'
      ? await this.habitsService.incrementProgress(habit.id, 1)
      : await this.habitsService.markDone(habit.id);

    if (!result.wasAdded) return;

    // "All done today" if every remaining active habit is now complete.
    const active = this.activeHabits();
    const allDoneNow = active.every(h =>
      h.id === habit.id ? true : isDoneToday(h),
    );

    // Mark routines fully done.
    for (const routine of this.routines()) {
      const rHabits = routine.habitIds
        .map(rid => active.find(h => h.id === rid))
        .filter((h): h is Habit => h != null);
      if (rHabits.length > 0) {
        const allRoutineDone = rHabits.every(h =>
          h.id === habit.id ? true : isDoneToday(h),
        );
        if (allRoutineDone) {
          void this.routinesService.markRoutineCompleteForToday(routine.id);
        }
      }
    }

    let xpAmount = XP_COMPLETE_HABIT;
    if (allDoneNow) xpAmount += XP_ALL_DONE_BONUS;
    if (result.newStreak > 0 && result.newStreak % 7 === 0) xpAmount += XP_STREAK_7;

    await this.gamification.awardXP(xpAmount, { allHabitsDone: allDoneNow }, active);
    this.toast.success(
      allDoneNow ? `All done! +${xpAmount} XP` : `+${xpAmount} XP earned`,
      { duration: 2200 },
    );

    if (allDoneNow) {
      this.shell?.triggerConfetti();
      this.haptics.success();
    }

    // Open the note sheet so the user can record a thought.
    const today = toDateKey(new Date());
    const existing = active.find(h => h.id === habit.id)?.notes?.[today] ?? '';
    this.noteText.set(existing);
    this.noteSheet.set({ habitId: habit.id, date: today });
  }

  // ── Note sheet handlers ──────────────────────────────────────────────
  protected closeNoteSheet(): void {
    this.noteSheet.set(null);
  }

  protected onNoteInput(e: Event): void {
    this.noteText.set((e.target as HTMLTextAreaElement).value);
  }

  protected noteHabitName(): string {
    const sheet = this.noteSheet();
    if (!sheet) return '';
    return this.habits().find(h => h.id === sheet.habitId)?.name ?? '';
  }

  protected async saveNote(): Promise<void> {
    const sheet = this.noteSheet();
    const text = this.noteText().trim();
    if (sheet && text) {
      await this.habitsService.addNote(sheet.habitId, sheet.date, text);
    }
    this.closeNoteSheet();
  }

  protected skipNote(): void {
    this.closeNoteSheet();
  }

  // ── Permission guide ─────────────────────────────────────────────────
  protected dismissPermGuide(): void {
    this.showPermGuide.set(false);
  }

  // ── Item track helpers ───────────────────────────────────────────────
  protected trackById(_i: number, item: ListItem): string {
    return item.id;
  }

  /** Lookup TOD icon + label inline (template can't index the readonly meta). */
  protected todMeta(tod: TimeOfDay) {
    return TOD_META[tod];
  }
}
