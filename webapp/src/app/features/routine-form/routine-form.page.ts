import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import {
  HABIT_COLORS,
  HABIT_ICONS,
  type HabitColor,
  type HabitIconName,
} from '../../core/models/category';
import type { Routine } from '../../core/models/routine';
import { HabitsService } from '../../core/services/habits.service';
import { RoutinesService } from '../../core/services/routines.service';
import { ToastService } from '../../core/services/toast.service';
import { formatTime } from '../../core/utils/format.util';
import {
  BottomSheetComponent,
} from '../../shared/components/bottom-sheet/bottom-sheet.component';
import {
  ClockFaceComponent,
} from '../../shared/components/clock-face/clock-face.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

/**
 * RoutineFormPage — port of src/app/new-routine.tsx.
 *
 * Handles both create and edit modes via the `?edit=<id>` query param.
 * Validation matches the mobile app: trimmed name required + at least one
 * habit selected. Save payload is `{name, icon, color, habitIds, reminderTime}`
 * with `reminderTime = null` when the toggle is off.
 */
@Component({
  selector: 'app-routine-form-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IoniconComponent,
    BottomSheetComponent,
    ClockFaceComponent,
  ],
  templateUrl: './routine-form.page.html',
  styleUrl: './routine-form.page.scss',
})
export class RoutineFormPage {
  private readonly route    = inject(ActivatedRoute);
  private readonly router   = inject(Router);
  private readonly routines = inject(RoutinesService);
  private readonly habits   = inject(HabitsService);
  private readonly toast    = inject(ToastService);

  readonly existing = signal<Routine | undefined>(undefined);

  readonly name           = signal<string>('');
  readonly icon           = signal<HabitIconName>(HABIT_ICONS[0]);
  readonly color          = signal<HabitColor>(HABIT_COLORS[0]);
  readonly habitIds       = signal<string[]>([]);
  readonly enableReminder = signal<boolean>(false);
  readonly hour           = signal<number>(7);
  readonly minute         = signal<number>(0);
  readonly saving         = signal<boolean>(false);

  readonly showTimePicker = signal<boolean>(false);
  readonly pickerHour     = signal<number>(7);
  readonly pickerMinute   = signal<number>(0);

  readonly title = computed(() => (this.existing() ? 'Edit Routine' : 'New Routine'));

  readonly iconChoices  = HABIT_ICONS;
  readonly colorChoices = HABIT_COLORS;

  readonly activeHabits = computed(() => this.habits.activeHabits());

  readonly timeLabel = computed(() => formatTime(this.hour(), this.minute()));

  readonly pickerTimeLabel = computed(
    () => formatTime(this.pickerHour(), this.pickerMinute()),
  );

  readonly habitsSelectedLabel = computed(() => {
    const n = this.habitIds().length;
    return `${n} habit${n !== 1 ? 's' : ''} selected`;
  });

  readonly previewSub = computed(() => {
    const n = this.habitIds().length;
    return `${n} habit${n !== 1 ? 's' : ''}`;
  });

  constructor() {
    effect(() => {
      const editId = this.route.snapshot.queryParamMap.get('edit');
      if (!editId) return;
      const existing = this.routines.routines().find(r => r.id === editId);
      if (existing && this.existing()?.id !== existing.id) {
        this.applyExisting(existing);
      }
    });
  }

  private applyExisting(r: Routine): void {
    this.existing.set(r);
    this.name.set(r.name);
    this.icon.set(r.icon as HabitIconName);
    this.color.set(r.color as HabitColor);
    this.habitIds.set([...r.habitIds]);
    this.enableReminder.set(r.reminderTime != null);
    if (r.reminderTime) {
      this.hour.set(r.reminderTime.hour);
      this.minute.set(r.reminderTime.minute);
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────

  onNameInput(e: Event): void {
    this.name.set((e.target as HTMLInputElement).value);
  }

  selectIcon(name: string): void {
    this.icon.set(name as HabitIconName);
  }

  selectColor(c: string): void {
    this.color.set(c as HabitColor);
  }

  toggleHabit(habitId: string): void {
    this.habitIds.update(prev =>
      prev.includes(habitId) ? prev.filter(id => id !== habitId) : [...prev, habitId],
    );
  }

  isSelected(id: string): boolean {
    return this.habitIds().includes(id);
  }

  toggleReminder(): void {
    this.enableReminder.update(v => !v);
  }

  openTimePicker(): void {
    this.pickerHour.set(this.hour());
    this.pickerMinute.set(this.minute());
    this.showTimePicker.set(true);
  }

  closeTimePicker(): void {
    this.showTimePicker.set(false);
  }

  confirmTimePicker(): void {
    this.hour.set(this.pickerHour());
    this.minute.set(this.pickerMinute());
    this.showTimePicker.set(false);
  }

  // ── Save / cancel ─────────────────────────────────────────────────────

  cancel(): void {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/');
  }

  async save(): Promise<void> {
    const trimmed = this.name().trim();
    if (!trimmed) {
      this.toast.error('Please enter a routine name');
      return;
    }
    if (this.habitIds().length === 0) {
      this.toast.error('Choose at least one habit for this routine');
      return;
    }
    this.saving.set(true);
    try {
      const reminderTime = this.enableReminder()
        ? { hour: this.hour(), minute: this.minute() }
        : null;
      const ex = this.existing();
      if (ex) {
        await this.routines.updateRoutine(ex.id, {
          name: trimmed,
          icon: this.icon(),
          color: this.color(),
          habitIds: this.habitIds(),
          reminderTime,
        });
        this.toast.success(`Updated "${trimmed}"`);
      } else {
        await this.routines.addRoutine({
          name: trimmed,
          icon: this.icon(),
          color: this.color(),
          habitIds: this.habitIds(),
          reminderTime,
        });
        this.toast.success(`Added "${trimmed}"`);
      }
      this.cancel();
    } catch (e) {
      this.toast.error(`Could not save routine: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.saving.set(false);
    }
  }
}
