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
  ENERGY_LABEL,
  MOOD_LABEL,
  type MoodScore,
} from '../../core/models/mood';
import { MoodService } from '../../core/services/mood.service';
import { toDateKey } from '../../core/utils/dates.util';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';
import { MoodPickerComponent } from './mood-picker.component';

/**
 * JournalPage — port of src/app/journal/[date].tsx.
 *
 * The route segment accepts the literal `"today"` and resolves it to
 * `toDateKey(new Date())` so deep-links from notifications and the profile
 * tab's Journal quick-action both work cleanly.
 *
 * Morning + Evening cards each render two `MoodPicker`s (Mood + Energy).
 * Reflection card is a multiline textarea (autofocus when empty).
 *
 * On Save:
 *  - `upsertEntry(date, {morningMood, morningEnergy, eveningMood, eveningEnergy})`
 *  - `setReflection(date, text)`  (empty drops the field; entry with only
 *    `date` is removed from the store)
 */
@Component({
  selector: 'app-journal-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IoniconComponent,
    ButtonComponent,
    CardComponent,
    MoodPickerComponent,
  ],
  templateUrl: './journal.page.html',
  styleUrl: './journal.page.scss',
})
export class JournalPage {
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly mood   = inject(MoodService);

  /** Resolved YYYY-MM-DD key (literal `"today"` → today's local date). */
  readonly dateKey = computed(() => {
    const raw = this.route.snapshot.paramMap.get('date');
    if (!raw || raw === 'today') return toDateKey(new Date());
    return raw;
  });

  readonly dateLabel = computed(() => {
    const d = new Date(this.dateKey() + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  });

  readonly morningMood   = signal<MoodScore | undefined>(undefined);
  readonly morningEnergy = signal<MoodScore | undefined>(undefined);
  readonly eveningMood   = signal<MoodScore | undefined>(undefined);
  readonly eveningEnergy = signal<MoodScore | undefined>(undefined);
  readonly reflection    = signal<string>('');

  readonly autoFocus = computed(() => {
    const existing = this.mood.entries()[this.dateKey()];
    return !existing?.reflection;
  });

  readonly moodLabels   = MOOD_LABEL;
  readonly energyLabels = ENERGY_LABEL;

  constructor() {
    // Sync local form state from MoodService when the date or store changes.
    effect(() => {
      const key = this.dateKey();
      const existing = this.mood.entries()[key];
      this.morningMood.set(existing?.morningMood);
      this.morningEnergy.set(existing?.morningEnergy);
      this.eveningMood.set(existing?.eveningMood);
      this.eveningEnergy.set(existing?.eveningEnergy);
      this.reflection.set(existing?.reflection ?? '');
    });
  }

  onReflectionInput(e: Event): void {
    this.reflection.set((e.target as HTMLTextAreaElement).value);
  }

  async save(): Promise<void> {
    const key = this.dateKey();
    await this.mood.upsertEntry(key, {
      morningMood:   this.morningMood(),
      morningEnergy: this.morningEnergy(),
      eveningMood:   this.eveningMood(),
      eveningEnergy: this.eveningEnergy(),
    });
    await this.mood.setReflection(key, this.reflection());
    this.goBack();
  }

  goBack(): void {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/');
  }
}
