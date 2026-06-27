import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * ConfettiComponent — port of src/components/ui/Confetti.tsx using
 * `canvas-confetti` (a tiny wrapper around a self-managed canvas).
 *
 * Palette ports verbatim from the mobile app:
 *   ['#FF8B1F','#10B981','#6366F1','#F43F5E','#FBBF24','#34D399','#A78BFA']
 *
 *  - 40 particles, 90° spread, origin { y: 0.5 } (matches mobile burst).
 *  - Honours `prefers-reduced-motion` by returning early without animating
 *    so the parent's `done` callback still fires after a short delay.
 *
 * Designed to be used like:
 *   <app-confetti [visible]="confetti()" (done)="confetti.set(false)" />
 */
@Component({
  selector: 'app-confetti',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class ConfettiComponent {
  readonly visible = input<boolean>(false);
  readonly done = output<void>();

  private readonly platformId = inject(PLATFORM_ID);

  private static readonly COLORS = [
    '#FF8B1F', '#10B981', '#6366F1', '#F43F5E', '#FBBF24', '#34D399', '#A78BFA',
  ];

  constructor() {
    effect(() => {
      if (!this.visible() || !isPlatformBrowser(this.platformId)) return;
      this.fire();
    });
  }

  private async fire(): Promise<void> {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      setTimeout(() => this.done.emit(), 50);
      return;
    }

    // Lazy-load canvas-confetti so it doesn't add to the initial bundle.
    const { default: confetti } = await import('canvas-confetti');
    confetti({
      particleCount: 40,
      spread: 90,
      origin: { y: 0.5 },
      colors: ConfettiComponent.COLORS,
    });
    setTimeout(() => this.done.emit(), 1500);
  }
}
