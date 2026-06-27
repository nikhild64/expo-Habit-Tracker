import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { HabitsService } from '../../core/services/habits.service';
import { NotificationsService, type PermissionState } from '../../core/services/notifications.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { ACCENT_PRESETS, type AccentId } from '../../core/models/theme';
import type { Frequency, HabitCategory } from '../../core/models/habit';
import { TEMPLATE_BUNDLES } from '../../core/utils/templates.util';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

type SlideId = 'intro' | 'notify' | 'accent' | 'streaks' | 'templates' | 'first';

type SlideStyle = { bg: string; ring: string; iconBg: string };

const SLIDE_BG: Record<SlideId, SlideStyle> = {
  intro:     { bg: '#EFF6FF', ring: '#BFDBFE', iconBg: '#2563EB' },
  notify:    { bg: '#FFF7ED', ring: '#FED7AA', iconBg: '#EA580C' },
  accent:    { bg: '#FDF4FF', ring: '#F5D0FE', iconBg: '#A855F7' },
  streaks:   { bg: '#F0FDF4', ring: '#BBF7D0', iconBg: '#16A34A' },
  templates: { bg: '#FFFBEB', ring: '#FDE68A', iconBg: '#D97706' },
  first:     { bg: '#FFE4E6', ring: '#FECDD3', iconBg: '#F43F5E' },
};

type Slide = {
  id: SlideId;
  icon: string;
  title: string;
  subtitle: string;
};

const SLIDES: Slide[] = [
  { id: 'intro',     icon: 'sparkles',      title: 'Build Better\nHabits',    subtitle: 'Small daily actions compound into extraordinary results. Every check-in brings you one step closer.' },
  { id: 'notify',    icon: 'notifications', title: 'Never Miss\na Day',       subtitle: "Smart reminders fire right on time — even when you're offline. We never spam you." },
  { id: 'accent',    icon: 'color-palette', title: 'Pick Your\nVibe',         subtitle: 'Choose an accent color. You can change it later in Settings or unlock more in the Shop.' },
  { id: 'streaks',   icon: 'flame',         title: 'Celebrate\nYour Streaks', subtitle: 'Watch your streaks grow day by day. Earned freezes cover the days life gets in the way.' },
  { id: 'templates', icon: 'grid',          title: 'Quick-Start\nTemplates',  subtitle: 'Browse pre-built bundles like Morning Routine, Fitness, or Mindfulness — dozens of expert habits, one tap each.' },
  { id: 'first',     icon: 'rocket',        title: 'Create Your\nFirst Habit', subtitle: 'Pick one to start. You can always add more, edit, or delete from the app.' },
];

type QuickHabit = {
  name: string;
  icon: string;
  color: string;
  category: HabitCategory;
};

const QUICK_HABITS: QuickHabit[] = [
  { name: 'Drink Water',     icon: 'water-outline',   color: '#3B82F6', category: 'Health' },
  { name: 'Read 20 Minutes', icon: 'book-outline',    color: '#8B5CF6', category: 'Learning' },
  { name: 'Workout',         icon: 'barbell-outline', color: '#EF4444', category: 'Health' },
  { name: 'Meditate',        icon: 'leaf-outline',    color: '#16A34A', category: 'Mindfulness' },
  { name: 'Journal',         icon: 'book-outline',    color: '#EC4899', category: 'Mindfulness' },
];

/**
 * OnboardingScreen — port of src/app/onboarding.tsx.
 *
 * Horizontal scroll-snap pager with 6 slides.  Each slide is full-viewport
 * wide; native `scroll-snap-type: x mandatory` does the page-snap.  An
 * IntersectionObserver derives the active slide so the dots + bottom-sheet
 * title/subtitle stay in sync without onScroll math.
 *
 * Per-slide widgets:
 *   - notify    → in-line NotificationsService.requestPermission() button.
 *   - accent    → 3 free accent disks.
 *   - templates → 3 template-bundle preview cards + Browse-all button.
 *   - first     → 5 quick-add chips (one-tap binary daily 9 AM morning habit).
 *
 * Bottom sheet contains: dots + title (28/800) + subtitle + back/next buttons
 * filled in the current slide's iconBg colour.
 *
 * Finishing: writes `onboarding_v1='done'` + routes to `/`.
 */
@Component({
  selector: 'app-onboarding-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IoniconComponent],
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',
})
export default class OnboardingPage {
  private readonly habitsService = inject(HabitsService);
  private readonly notifications = inject(NotificationsService);
  private readonly onboarding = inject(OnboardingService);
  private readonly themeService = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  private readonly scrollEl = viewChild<ElementRef<HTMLDivElement>>('scrollEl');

  readonly slides = SLIDES;
  readonly quickHabits = QUICK_HABITS;

  readonly current = signal(0);
  readonly permStatus = signal<PermissionState | 'requesting'>(this.notifications.permission());
  readonly seededName = signal<string | null>(null);

  readonly accent = this.themeService.accent;
  readonly freeAccents = ACCENT_PRESETS.filter(a => a.free);
  readonly templates = TEMPLATE_BUNDLES.slice(0, 3);

  readonly currentSlide = computed(() => this.slides[this.current()]);
  readonly currentPalette = computed(() => SLIDE_BG[this.currentSlide().id]);

  readonly isLast = computed(() => this.current() === this.slides.length - 1);
  readonly isFirst = computed(() => this.current() === 0);

  readonly nextLabel = computed(() => {
    if (!this.isLast()) return 'Next';
    return this.seededName() ? "Let's go!" : 'Skip for now';
  });

  /** Returns true when the user can tap the bio shortcut (notify slide only). */
  readonly canRequestNotify = computed(() => this.permStatus() === 'default');

  paletteFor(id: SlideId): SlideStyle {
    return SLIDE_BG[id];
  }

  isActiveAccent(id: AccentId): boolean {
    return this.accent() === id;
  }

  // ── Navigation ────────────────────────────────────────────────────────

  go(index: number): void {
    const target = Math.max(0, Math.min(this.slides.length - 1, index));
    const el = this.scrollEl()?.nativeElement;
    if (el) {
      el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' });
    }
    this.current.set(target);
  }

  onScroll(): void {
    const el = this.scrollEl()?.nativeElement;
    if (!el) return;
    const width = el.clientWidth || 1;
    const next = Math.round(el.scrollLeft / width);
    if (next !== this.current()) {
      this.current.set(Math.max(0, Math.min(this.slides.length - 1, next)));
    }
  }

  async finish(): Promise<void> {
    await this.onboarding.markDone();
    void this.router.navigate(['/']);
  }

  // ── Notify slide ──────────────────────────────────────────────────────

  async allowNotifications(): Promise<void> {
    this.permStatus.set('requesting');
    try {
      const status = await this.notifications.requestPermission();
      this.permStatus.set(status);
      if (status === 'granted') this.toast.success('Reminders enabled');
      else if (status === 'denied') this.toast.info('You can enable later in Settings');
    } catch {
      this.permStatus.set('denied');
    }
  }

  // ── Accent slide ─────────────────────────────────────────────────────

  pickAccent(id: AccentId): void {
    this.themeService.setAccent(id);
  }

  // ── Templates slide ──────────────────────────────────────────────────

  async browseTemplates(): Promise<void> {
    await this.onboarding.markDone();
    void this.router.navigate(['/templates']);
  }

  // ── First habit slide ────────────────────────────────────────────────

  async quickAdd(q: QuickHabit): Promise<void> {
    const frequency: Frequency = { kind: 'daily', hour: 9, minute: 0 };
    await this.habitsService.addHabit({
      name: q.name,
      icon: q.icon,
      color: q.color,
      frequency,
      category: q.category,
      habitType: 'binary',
      timeOfDay: 'morning',
    });
    this.seededName.set(q.name);
    this.toast.success(`Added "${q.name}"`);
  }

  isAdded(q: QuickHabit): boolean {
    return this.seededName() === q.name;
  }
}
