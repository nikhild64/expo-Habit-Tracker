import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import type {
  Frequency,
  Habit,
  HabitCategory,
  HabitType,
  Subtask,
  TimeOfDay,
} from '../../core/models/habit';
import {
  CATEGORY_META,
  HABIT_COLORS,
  HABIT_ICONS,
  type HabitColor,
  type HabitIconName,
} from '../../core/models/category';
import { HabitsService } from '../../core/services/habits.service';
import { ToastService } from '../../core/services/toast.service';
import { formatTime } from '../../core/utils/format.util';
import {
  BottomSheetComponent,
} from '../../shared/components/bottom-sheet/bottom-sheet.component';
import { ClockFaceComponent } from '../../shared/components/clock-face/clock-face.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';
import { StepperComponent } from '../../shared/components/stepper/stepper.component';

type FreqKind = Frequency['kind'];

/** Frequency rail options — order + labels + icons match src/app/new.tsx. */
const FREQ_OPTIONS: { kind: FreqKind; label: string; icon: string }[] = [
  { kind: 'daily',    label: 'Daily',         icon: 'sunny-outline'     },
  { kind: 'weekdays', label: 'Weekdays',      icon: 'briefcase-outline' },
  { kind: 'weekends', label: 'Weekends',      icon: 'cafe-outline'      },
  { kind: 'weekly',   label: 'Specific days', icon: 'calendar-outline'  },
  { kind: 'xperweek', label: 'X per week',    icon: 'repeat-outline'    },
  { kind: 'interval', label: 'Every N days',  icon: 'timer-outline'     },
];

const HABIT_TYPE_OPTIONS: { id: HabitType; label: string; sub: string; icon: string }[] = [
  { id: 'binary',       label: 'Yes / No',   sub: 'Tap to mark done',           icon: 'checkmark-circle-outline' },
  { id: 'quantitative', label: 'Count',      sub: 'Track toward a target',       icon: 'flask-outline'           },
  { id: 'timed',        label: 'Timed',      sub: 'Built-in timer + Pomodoro',   icon: 'timer-outline'           },
  { id: 'negative',     label: 'Quit habit', sub: 'Track days without slipping', icon: 'remove-circle-outline'   },
];

const TIME_OF_DAY_OPTIONS: { id: TimeOfDay; label: string; icon: string }[] = [
  { id: 'morning',   label: 'Morning',   icon: 'sunny-outline'        },
  { id: 'afternoon', label: 'Afternoon', icon: 'partly-sunny-outline' },
  { id: 'evening',   label: 'Evening',   icon: 'moon-outline'         },
  { id: 'anytime',   label: 'Anytime',   icon: 'infinite-outline'     },
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_FULL   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CATEGORIES = Object.keys(CATEGORY_META) as HabitCategory[];

/** Subtask id helper — matches `'st_' + 7-char base36 random` from new.tsx. */
function genSubtaskId(): string {
  return 'st_' + Math.random().toString(36).slice(2, 9);
}

/**
 * HabitFormPage — port of src/app/new.tsx.
 *
 * Handles both create and edit modes:
 *  - `?edit=<id>` — load that habit's values, render "Edit Habit" + Save.
 *  - `?type=<binary|quantitative|timed|negative>` — preselect the habit type
 *    (used by the onboarding "Add as a binary habit" entry path).
 *
 * Live preview at the top reflects icon/color/name choices immediately.
 * Save payload uses a discriminated `Frequency` union per the source.
 *
 * Reminder time uses the shared `ClockFaceComponent` inside a `BottomSheet`,
 * mirroring the mobile app's modal sheet + Confirm button at the bottom.
 */
@Component({
  selector: 'app-habit-form-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IoniconComponent,
    StepperComponent,
    ClockFaceComponent,
    BottomSheetComponent,
  ],
  templateUrl: './habit-form.page.html',
  styleUrl: './habit-form.page.scss',
})
export class HabitFormPage {
  private readonly route   = inject(ActivatedRoute);
  private readonly router  = inject(Router);
  private readonly habits  = inject(HabitsService);
  private readonly toast   = inject(ToastService);

  /** Existing habit when editing — kept as a signal so we can react to load. */
  readonly existing = signal<Habit | undefined>(undefined);

  // ── Form state signals ──────────────────────────────────────────────────
  readonly name      = signal<string>('');
  readonly icon      = signal<HabitIconName>(HABIT_ICONS[0]);
  readonly color     = signal<HabitColor>(HABIT_COLORS[0]);
  readonly habitType = signal<HabitType>('binary');
  readonly timeOfDay = signal<TimeOfDay>('anytime');

  readonly kind          = signal<FreqKind>('daily');
  readonly weekdays      = signal<number[]>([2, 3, 4, 5, 6]); // Expo: 1=Sun..7=Sat → Mon-Fri
  readonly xperweekCount = signal<number>(3);
  readonly intervalDays  = signal<number>(2);
  readonly hour          = signal<number>(8);
  readonly minute        = signal<number>(0);

  readonly category    = signal<HabitCategory>('Other');
  readonly targetValue = signal<number>(8);
  readonly targetUnit  = signal<string>('glasses');
  readonly timerMinutes = signal<number>(25);

  readonly subtasks       = signal<Subtask[]>([]);
  readonly newSubtaskText = signal<string>('');

  readonly saving = signal(false);

  // ── Time picker state ──────────────────────────────────────────────────
  readonly showTimePicker = signal(false);
  readonly pickerHour     = signal(8);
  readonly pickerMinute   = signal(0);

  // ── Computed UI helpers ────────────────────────────────────────────────
  readonly title = computed(() => (this.existing() ? 'Edit Habit' : 'New Habit'));

  readonly habitTypeLabel = computed(
    () => HABIT_TYPE_OPTIONS.find(o => o.id === this.habitType())?.label ?? '',
  );

  readonly timeLabel = computed(() => formatTime(this.hour(), this.minute()));

  readonly pickerTimeLabel = computed(
    () => formatTime(this.pickerHour(), this.pickerMinute()),
  );

  readonly typeOptions  = HABIT_TYPE_OPTIONS;
  readonly todOptions   = TIME_OF_DAY_OPTIONS;
  readonly iconChoices  = HABIT_ICONS;
  readonly colorChoices = HABIT_COLORS;
  readonly catChoices   = CATEGORIES;
  readonly catMeta      = CATEGORY_META;
  readonly freqOptions  = FREQ_OPTIONS;
  readonly dayLabels    = DAY_LABELS;
  readonly dayFull      = DAY_FULL;

  readonly hasSubtaskText = computed(() => this.newSubtaskText().trim().length > 0);

  /** Human-readable frequency summary mirrored from src/app/new.tsx. */
  readonly freqSummary = computed(() => {
    switch (this.kind()) {
      case 'daily':    return 'Repeats every day';
      case 'weekdays': return 'Repeats Monday to Friday';
      case 'weekends': return 'Repeats Saturday and Sunday';
      case 'weekly':   return `Repeats on selected days (${this.weekdays().length} selected)`;
      case 'xperweek': return `Complete any ${this.xperweekCount()} days per week`;
      case 'interval': return `Complete once every ${this.intervalDays()} days`;
      default:         return '';
    }
  });

  constructor() {
    // Read query params once on construction, then again on any nav change.
    effect(() => {
      const params = this.route.snapshot.queryParamMap;
      const editId = params.get('edit');
      const typeParam = params.get('type') as HabitType | null;

      if (editId) {
        const existing = this.habits.habits().find(h => h.id === editId);
        if (existing) {
          this.applyExisting(existing);
        }
      } else if (typeParam && ['binary', 'quantitative', 'timed', 'negative'].includes(typeParam)) {
        this.habitType.set(typeParam);
      }
    });

    // Re-apply if the habits load asynchronously after this page was opened.
    effect(() => {
      const editId = this.route.snapshot.queryParamMap.get('edit');
      if (!editId) return;
      const existing = this.habits.habits().find(h => h.id === editId);
      if (existing && this.existing()?.id !== existing.id) {
        this.applyExisting(existing);
      }
    });
  }

  private applyExisting(h: Habit): void {
    this.existing.set(h);
    this.name.set(h.name);
    this.icon.set(h.icon as HabitIconName);
    this.color.set(h.color as HabitColor);
    this.kind.set(h.frequency.kind);
    this.hour.set(h.frequency.hour);
    this.minute.set(h.frequency.minute);
    if (h.frequency.kind === 'weekly')   this.weekdays.set(h.frequency.weekdays);
    if (h.frequency.kind === 'xperweek') this.xperweekCount.set(h.frequency.count);
    if (h.frequency.kind === 'interval') this.intervalDays.set(h.frequency.days);
    this.category.set(h.category ?? 'Other');
    this.habitType.set(h.habitType ?? 'binary');
    this.timeOfDay.set(h.timeOfDay ?? 'anytime');
    this.targetValue.set(h.target?.value ?? 8);
    this.targetUnit.set(h.target?.unit ?? 'glasses');
    if (h.target?.timerSeconds) this.timerMinutes.set(Math.round(h.target.timerSeconds / 60));
    this.subtasks.set(h.subtasks ?? []);
  }

  // ── Event handlers ─────────────────────────────────────────────────────

  onNameInput(e: Event): void {
    this.name.set((e.target as HTMLInputElement).value);
  }

  selectHabitType(id: HabitType): void {
    this.habitType.set(id);
  }

  onTargetValueInput(e: Event): void {
    const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '');
    const parsed = parseInt(raw, 10);
    this.targetValue.set(Math.max(1, isNaN(parsed) ? 1 : parsed));
  }

  onTargetUnitInput(e: Event): void {
    this.targetUnit.set((e.target as HTMLInputElement).value);
  }

  selectTimeOfDay(id: TimeOfDay): void {
    this.timeOfDay.set(id);
  }

  selectIcon(name: string): void {
    this.icon.set(name as HabitIconName);
  }

  selectColor(c: string): void {
    this.color.set(c as HabitColor);
  }

  selectCategory(c: HabitCategory): void {
    this.category.set(c);
  }

  selectFreq(k: FreqKind): void {
    this.kind.set(k);
  }

  toggleWeekday(day: number): void {
    this.weekdays.update(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  // ── Subtask add / remove ──────────────────────────────────────────────

  onSubtaskTextInput(e: Event): void {
    this.newSubtaskText.set((e.target as HTMLInputElement).value);
  }

  addSubtask(): void {
    const trimmed = this.newSubtaskText().trim();
    if (!trimmed) return;
    this.subtasks.update(list => [...list, { id: genSubtaskId(), label: trimmed }]);
    this.newSubtaskText.set('');
  }

  onSubtaskKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.addSubtask();
    }
  }

  removeSubtask(id: string): void {
    this.subtasks.update(list => list.filter(st => st.id !== id));
  }

  // ── Stepper change handlers ───────────────────────────────────────────

  onTimerMinutesChange(value: number): void {
    this.timerMinutes.set(value);
  }
  onXperweekChange(value: number): void {
    this.xperweekCount.set(value);
  }
  onIntervalChange(value: number): void {
    this.intervalDays.set(value);
  }

  // ── Time picker ───────────────────────────────────────────────────────

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

  // ── Save ──────────────────────────────────────────────────────────────

  cancel(): void {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/');
  }

  async save(): Promise<void> {
    const trimmed = this.name().trim();
    if (!trimmed) {
      this.toast.error('Please enter a habit name');
      return;
    }
    if (this.kind() === 'weekly' && this.weekdays().length === 0) {
      this.toast.error('Choose at least one day of the week');
      return;
    }
    if (this.habitType() === 'quantitative' && (this.targetValue() < 1 || !this.targetUnit().trim())) {
      this.toast.error('Set a target value and unit');
      return;
    }
    if (this.habitType() === 'timed' && this.timerMinutes() < 1) {
      this.toast.error('Set a target duration');
      return;
    }

    const k = this.kind();
    const h = this.hour();
    const m = this.minute();
    const frequency: Frequency =
      k === 'daily'    ? { kind: 'daily',    hour: h, minute: m } :
      k === 'weekly'   ? { kind: 'weekly',   weekdays: this.weekdays(), hour: h, minute: m } :
      k === 'weekdays' ? { kind: 'weekdays', hour: h, minute: m } :
      k === 'weekends' ? { kind: 'weekends', hour: h, minute: m } :
      k === 'xperweek' ? { kind: 'xperweek', count: this.xperweekCount(), hour: h, minute: m } :
      /* interval */     { kind: 'interval', days:  this.intervalDays(),  hour: h, minute: m };

    const target =
      this.habitType() === 'quantitative'
        ? { value: this.targetValue(), unit: (this.targetUnit().trim() || 'units') }
        : this.habitType() === 'timed'
          ? { value: this.timerMinutes(), unit: 'min', timerSeconds: this.timerMinutes() * 60 }
          : undefined;

    this.saving.set(true);
    try {
      const subs = this.subtasks();
      const payload = {
        name: trimmed,
        icon: this.icon(),
        color: this.color(),
        frequency,
        category: this.category(),
        habitType: this.habitType(),
        timeOfDay: this.timeOfDay(),
        target,
        subtasks: subs.length > 0 ? subs : undefined,
      };
      const ex = this.existing();
      if (ex) {
        await this.habits.updateHabit(ex.id, payload);
        this.toast.success(`Updated "${trimmed}"`);
      } else {
        await this.habits.addHabit(payload);
        this.toast.success(`Added "${trimmed}"`);
      }
      this.cancel();
    } catch (e) {
      this.toast.error(`Could not save habit: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.saving.set(false);
    }
  }
}
