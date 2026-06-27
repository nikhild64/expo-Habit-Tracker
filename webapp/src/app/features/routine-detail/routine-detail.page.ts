import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import type { Habit } from '../../core/models/habit';
import type { Routine } from '../../core/models/routine';
import { HabitsService } from '../../core/services/habits.service';
import { RoutinesService } from '../../core/services/routines.service';
import { formatTime } from '../../core/utils/format.util';
import { isDoneToday } from '../../core/utils/streak.util';
import {
  ConfirmationComponent,
} from '../../shared/components/confirmation/confirmation.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

/**
 * RoutineDetailPage — port of src/app/routine/[id].tsx.
 *
 * Sections (top to bottom):
 *  - Header (back + Edit pill → /new-routine?edit=:id)
 *  - Identity (88px badge + name + "N habit(s) [· h:mm AM/PM]")
 *  - 3-cell stats row (Current streak / Best streak / Started)
 *  - Today progress card (60px ring, color goes green at 100%)
 *  - Streak callout when streak > 1
 *  - All-done banner at 100%
 *  - Mark all remaining done button (hidden at 100% or when empty)
 *  - Habit checklist with circular checkboxes (per-habit toggle)
 *  - Delete action with Confirmation modal
 */
@Component({
  selector: 'app-routine-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IoniconComponent,
    ConfirmationComponent,
  ],
  templateUrl: './routine-detail.page.html',
  styleUrl: './routine-detail.page.scss',
})
export class RoutineDetailPage {
  private readonly route    = inject(ActivatedRoute);
  private readonly router   = inject(Router);
  private readonly routines = inject(RoutinesService);
  private readonly habits   = inject(HabitsService);

  readonly routine = computed<Routine | undefined>(() => {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return undefined;
    return this.routines.routines().find(r => r.id === id);
  });

  readonly routineHabits = computed<Habit[]>(() => {
    const r = this.routine();
    if (!r) return [];
    return r.habitIds
      .map(hid => this.habits.habits().find(h => h.id === hid))
      .filter((h): h is Habit => h != null);
  });

  readonly doneCount  = computed(() => this.routineHabits().filter(isDoneToday).length);
  readonly totalCount = computed(() => this.routineHabits().length);
  readonly allDone    = computed(() => this.totalCount() > 0 && this.doneCount() === this.totalCount());
  readonly pct        = computed(() => {
    const t = this.totalCount();
    return t > 0 ? Math.round((this.doneCount() / t) * 100) : 0;
  });

  readonly identitySub = computed(() => {
    const r = this.routine();
    if (!r) return '';
    const total = this.totalCount();
    const base = `${total} habit${total !== 1 ? 's' : ''}`;
    if (!r.reminderTime) return base;
    return `${base} · ${formatTime(r.reminderTime.hour, r.reminderTime.minute)}`;
  });

  readonly progressTitle = computed(() => {
    const all = this.allDone();
    return all
      ? 'Routine complete!'
      : `${this.doneCount()} of ${this.totalCount()} done today`;
  });

  readonly progressSub = computed(() => {
    const total = this.totalCount();
    const all = this.allDone();
    if (total === 0) return 'No habits in this routine';
    if (all) return 'Great work — streak keeps going!';
    const remaining = total - this.doneCount();
    return `${remaining} habit${remaining !== 1 ? 's' : ''} remaining`;
  });

  readonly createdDate = computed(() => {
    const r = this.routine();
    if (!r) return '';
    return new Date(r.createdAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  });

  readonly pctLabel = computed(() => (this.totalCount() > 0 ? `${this.pct()}%` : '—'));

  // ── Confirmation modal state ──────────────────────────────────────────

  readonly confirmDeleteVisible = signal(false);

  goBack(): void {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/');
  }

  edit(): void {
    const r = this.routine();
    if (!r) return;
    this.router.navigate(['/new-routine'], { queryParams: { edit: r.id } });
  }

  isDone(habit: Habit): boolean {
    return isDoneToday(habit);
  }

  async toggleHabit(habit: Habit): Promise<void> {
    const r = this.routine();
    if (!r) return;
    const result = await this.habits.markDone(habit.id);
    if (!result.wasAdded) return;
    // Recompute against the freshly-updated habits signal.
    const allNowDone = this.routineHabits().every(h =>
      h.id === habit.id ? true : isDoneToday(h),
    );
    if (allNowDone) {
      await this.routines.markRoutineCompleteForToday(r.id);
    }
  }

  async markAllDone(): Promise<void> {
    const r = this.routine();
    if (!r) return;
    const targets = this.routineHabits();
    for (const h of targets) {
      if (!isDoneToday(h)) await this.habits.markDone(h.id);
    }
    await this.routines.markRoutineCompleteForToday(r.id);
  }

  openDeleteConfirm(): void {
    this.confirmDeleteVisible.set(true);
  }

  closeDeleteConfirm(): void {
    this.confirmDeleteVisible.set(false);
  }

  async deleteRoutine(): Promise<void> {
    const r = this.routine();
    if (!r) return;
    await this.routines.deleteRoutine(r.id);
    this.closeDeleteConfirm();
    this.goBack();
  }
}
