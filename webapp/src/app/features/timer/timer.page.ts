import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import type { Habit } from '../../core/models/habit';
import { HabitsService } from '../../core/services/habits.service';
import { HapticsService } from '../../core/services/haptics.service';
import { toDateKey } from '../../core/utils/dates.util';
import { timedProgressToday } from '../../core/utils/streak.util';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';
import {
  ProgressRingComponent,
} from '../../shared/components/progress-ring/progress-ring.component';

type Mode = 'work' | 'shortBreak' | 'longBreak';

const SHORT_BREAK_SEC = 5  * 60;
const LONG_BREAK_SEC  = 15 * 60;
const POMO_CYCLE      = 4;
const AUTOSAVE_EVERY  = 10; // seconds between autosaves of work-mode progress

interface WakeLockSentinel {
  release(): Promise<void>;
}

function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * TimerPage — port of src/app/timer/[id].tsx.
 *
 * Pomodoro state machine: WORK → SHORT_BREAK / LONG_BREAK → WORK …
 *   - WORK target = `habit.target.timerSeconds ?? 25 * 60`.
 *   - After each completed work session, `completedPomos++`. If the new count
 *     is a multiple of `POMO_CYCLE` (4) the next mode is LONG_BREAK, else
 *     SHORT_BREAK. After a break, returns to WORK.
 *
 * Persistence:
 *   - Every `AUTOSAVE_EVERY` seconds of work-mode progress, we commit the
 *     delta to `HabitsService.addTimerSeconds(id, delta)`.
 *   - Also on `visibilitychange === 'hidden'` and on component destroy.
 *   - `lastSavedRef` watermark prevents double-counting.
 *   - Break time is NEVER credited (only `mode === 'work'`).
 *
 * Screen wake lock: `navigator.wakeLock.request('screen')` when running.
 * Falls back silently when unsupported.
 */
@Component({
  selector: 'app-timer-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IoniconComponent,
    ProgressRingComponent,
  ],
  templateUrl: './timer.page.html',
  styleUrl: './timer.page.scss',
})
export class TimerPage implements OnDestroy {
  private readonly route   = inject(ActivatedRoute);
  private readonly router  = inject(Router);
  private readonly habits  = inject(HabitsService);
  private readonly haptics = inject(HapticsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly habit = computed<Habit | undefined>(() => {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return undefined;
    return this.habits.habits().find(h => h.id === id);
  });

  readonly target = computed(() => this.habit()?.target?.timerSeconds ?? 25 * 60);

  // ── Pomodoro state ────────────────────────────────────────────────────
  readonly mode    = signal<Mode>('work');
  readonly running = signal<boolean>(false);
  readonly elapsed = signal<number>(0);
  readonly completedPomos = signal<number>(0);

  /** Last `elapsed` we've already credited to HabitsService. */
  private lastSaved = 0;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  readonly sessionTarget = computed(() => {
    const m = this.mode();
    if (m === 'work')       return this.target();
    if (m === 'shortBreak') return SHORT_BREAK_SEC;
    return LONG_BREAK_SEC;
  });

  readonly remaining = computed(() => Math.max(0, this.sessionTarget() - this.elapsed()));
  readonly sessionProgress = computed(() => {
    const t = this.sessionTarget();
    return t > 0 ? this.elapsed() / t : 0;
  });

  readonly modeLabel = computed(() => {
    const m = this.mode();
    return m === 'work' ? 'Focus' : m === 'shortBreak' ? 'Short break' : 'Long break';
  });

  readonly timeLabel = computed(() => formatMMSS(this.remaining()));

  readonly cycleLabel = computed(() => {
    const h = this.habit();
    const min = h?.target?.timerSeconds ? Math.round(h.target.timerSeconds / 60) : null;
    const base = `Session ${this.completedPomos() + 1}`;
    return min ? `${base} · ${min} min` : base;
  });

  readonly todayProgress = computed(() => {
    const h = this.habit();
    return h ? timedProgressToday(h) : 0;
  });

  readonly todayLabel = computed(() => {
    const h = this.habit();
    if (!h) return '0 / 0 min';
    const key = toDateKey(new Date());
    const prior = (h.sessionSeconds ?? {})[key] ?? 0;
    const sessionUnsaved = this.mode() === 'work' ? this.elapsed() - this.lastSaved : 0;
    const totalSec = prior + Math.max(0, sessionUnsaved);
    const targetMin = Math.round((h.target?.timerSeconds ?? 60) / 60);
    const elapsedMin = Math.round(totalSec / 60);
    return `${elapsedMin} / ${targetMin} min`;
  });

  readonly todayProgressPct = computed(() =>
    `${Math.round(this.todayProgress() * 100)}%`,
  );

  constructor() {
    // Tick loop: starts/stops based on `running` and runs every 1s.
    effect(onCleanup => {
      const r = this.running();
      if (!r) {
        this.releaseWakeLock();
        return;
      }
      this.requestWakeLock();
      this.tickHandle = setInterval(() => {
        this.elapsed.update(v => v + 1);
      }, 1000);
      onCleanup(() => {
        if (this.tickHandle) clearInterval(this.tickHandle);
        this.tickHandle = null;
      });
    });

    // Autosave every AUTOSAVE_EVERY seconds while in work mode.
    effect(() => {
      const e = this.elapsed();
      if (this.mode() !== 'work') return;
      const habit = this.habit();
      if (!habit) return;
      if (e - this.lastSaved >= AUTOSAVE_EVERY) {
        const delta = e - this.lastSaved;
        this.lastSaved = e;
        this.habits.addTimerSeconds(habit.id, delta).catch(console.error);
      }
    });

    // Session-complete detection.
    effect(() => {
      const e = this.elapsed();
      if (!this.running()) return;
      const target = this.sessionTarget();
      if (e < target) return;
      this.completeSession();
    });

    // Final flush on destroy.
    this.destroyRef.onDestroy(() => {
      this.flushWork();
      this.releaseWakeLock();
      if (this.tickHandle) clearInterval(this.tickHandle);
    });
  }

  ngOnDestroy(): void {
    // Belt-and-braces with DestroyRef.onDestroy above; runs the same hooks.
    this.flushWork();
    this.releaseWakeLock();
  }

  // ── Visibility flush ──────────────────────────────────────────────────

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      this.flushWork();
    }
  }

  // ── Wake lock ─────────────────────────────────────────────────────────

  private async requestWakeLock(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    const wl = (navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> }
    }).wakeLock;
    if (!wl?.request) return;
    try {
      this.wakeLock = await wl.request('screen');
    } catch (e) {
      // Wake lock can fail if the document isn't visible — silently degrade.
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      /* ignore */
    }
    this.wakeLock = null;
  }

  // ── Session completion ────────────────────────────────────────────────

  private completeSession(): void {
    this.haptics.success();
    this.running.set(false);
    const m = this.mode();
    if (m === 'work') {
      // Flush any leftover seconds to the habit's session total.
      this.flushWork();
      const newCount = this.completedPomos() + 1;
      this.completedPomos.set(newCount);
      this.mode.set(newCount % POMO_CYCLE === 0 ? 'longBreak' : 'shortBreak');
    } else {
      this.mode.set('work');
    }
    this.elapsed.set(0);
    this.lastSaved = 0;
  }

  private flushWork(): void {
    const habit = this.habit();
    if (!habit) return;
    if (this.mode() !== 'work') return;
    const e = this.elapsed();
    if (e > this.lastSaved) {
      const delta = e - this.lastSaved;
      this.lastSaved = e;
      this.habits.addTimerSeconds(habit.id, delta).catch(console.error);
    }
  }

  // ── Controls ──────────────────────────────────────────────────────────

  toggleRunning(): void {
    this.haptics.medium();
    this.running.update(v => !v);
  }

  reset(): void {
    this.haptics.light();
    this.running.set(false);
    this.elapsed.set(0);
    this.lastSaved = 0;
  }

  flipMode(): void {
    // Commit any pending work seconds before switching.
    this.flushWork();
    this.mode.update(m => (m === 'work' ? 'shortBreak' : 'work'));
    this.elapsed.set(0);
    this.lastSaved = 0;
  }

  goBack(): void {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/');
  }
}
