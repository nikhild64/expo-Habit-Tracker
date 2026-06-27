import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { HabitsService } from '../../core/services/habits.service';
import {
  HABIT_TEMPLATES,
  TEMPLATE_BUNDLES,
  getTemplatesByBundle,
  type HabitTemplate,
  type TemplateBundle,
} from '../../core/utils/templates.util';
import {
  ConfirmationComponent,
} from '../../shared/components/confirmation/confirmation.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

type BundleSection = {
  bundle: TemplateBundle;
  templates: HabitTemplate[];
};

/**
 * TemplatesPage — port of src/app/templates.tsx.
 *
 * Renders the 6 bundles + 19 templates from `core/utils/templates.util.ts`.
 * Pre-marks templates as "added" when their name matches an existing habit
 * (case-insensitive). "Add all" opens a Confirmation modal with a bulleted
 * list of the templates that would be added.
 *
 * Each `addHabit({ name, icon, color, frequency, category })` creates a
 * binary habit with no target / no subtasks — same default as the mobile.
 */
@Component({
  selector: 'app-templates-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IoniconComponent,
    ConfirmationComponent,
  ],
  templateUrl: './templates.page.html',
  styleUrl: './templates.page.scss',
})
export class TemplatesPage {
  private readonly router = inject(Router);
  private readonly habits = inject(HabitsService);

  readonly templateCount = HABIT_TEMPLATES.length;
  readonly bundles: BundleSection[] = TEMPLATE_BUNDLES.map(bundle => ({
    bundle,
    templates: getTemplatesByBundle(bundle.id),
  }));

  /** IDs marked added — either pre-existing or added during this session. */
  readonly addedIds = signal<Set<string>>(new Set());

  /** Pending "add all" confirmation, or null. */
  readonly pendingAddAll = signal<HabitTemplate[] | null>(null);

  readonly subtitle = computed(() =>
    `${this.templateCount} ready-made habits to get started`,
  );

  readonly confirmTitle = computed(() => {
    const list = this.pendingAddAll();
    if (!list) return '';
    return `Add ${list.length} habit${list.length > 1 ? 's' : ''}?`;
  });

  readonly confirmMessage = computed(() => {
    const list = this.pendingAddAll();
    if (!list) return '';
    return list.map(t => `• ${t.name}`).join('\n');
  });

  constructor() {
    // Initial pre-mark: any template whose name matches an existing habit.
    effect(() => {
      const existing = new Set(this.habits.habits().map(h => h.name.toLowerCase()));
      const pre = new Set(
        HABIT_TEMPLATES.filter(t => existing.has(t.name.toLowerCase())).map(t => t.id),
      );
      // Merge with any IDs the user added in-session so we never un-tick.
      this.addedIds.update(prev => new Set([...pre, ...prev]));
    });
  }

  isAdded(t: HabitTemplate): boolean {
    return this.addedIds().has(t.id);
  }

  allAdded(templates: HabitTemplate[]): boolean {
    const ids = this.addedIds();
    return templates.every(t => ids.has(t.id));
  }

  freqLabel(t: HabitTemplate): string {
    const h = t.frequency.hour;
    const m = t.frequency.minute.toString().padStart(2, '0');
    const period = h >= 12 ? 'PM' : 'AM';
    const time = `${h % 12 || 12}:${m} ${period}`;
    return t.frequency.kind === 'daily' ? `Daily · ${time}` : time;
  }

  // ── Actions ───────────────────────────────────────────────────────────

  goBack(): void {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/');
  }

  async addOne(t: HabitTemplate): Promise<void> {
    if (this.isAdded(t)) return;
    await this.habits.addHabit({
      name: t.name,
      icon: t.icon,
      color: t.color,
      frequency: t.frequency,
      category: t.category,
    });
    this.addedIds.update(prev => new Set([...prev, t.id]));
  }

  openAddAll(templates: HabitTemplate[]): void {
    const toAdd = templates.filter(t => !this.isAdded(t));
    if (toAdd.length === 0) return;
    this.pendingAddAll.set(toAdd);
  }

  closeAddAll(): void {
    this.pendingAddAll.set(null);
  }

  async confirmAddAll(): Promise<void> {
    const list = this.pendingAddAll();
    if (!list) return;
    for (const t of list) {
      await this.habits.addHabit({
        name: t.name,
        icon: t.icon,
        color: t.color,
        frequency: t.frequency,
        category: t.category,
      });
    }
    this.addedIds.update(prev => new Set([...prev, ...list.map(t => t.id)]));
    this.pendingAddAll.set(null);
  }
}
