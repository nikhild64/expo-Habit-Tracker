import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ConfettiComponent } from '../../shared/components/confetti/confetti.component';
import { ToastOverlayComponent } from '../../shared/components/toast-overlay/toast-overlay.component';
import { ToastService } from '../../core/services/toast.service';
import { TabBarComponent } from '../tab-bar/tab-bar.component';

/**
 * ShellComponent — port of src/app/(tabs)/_layout.tsx + _layout.tsx.
 *
 * Top-level layout for the four-tab section of the app:
 *  - `<router-outlet>` for the active tab page.
 *  - Global `<app-toast-overlay>` so toasts float above every screen.
 *  - Global `<app-confetti>` driven by `triggerConfetti()` (exposed for
 *    downstream agents' Today screen to fire on `allDoneNow`).
 *  - Bottom `<app-tab-bar>` (glass surface).
 *
 * Content area is padded at the bottom with the tab-bar height + safe area
 * so scrollable screens don't hide their last row behind the bar.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, TabBarComponent, ToastOverlayComponent, ConfettiComponent],
  template: `
    <main id="main" class="content" tabindex="-1">
      <router-outlet />
    </main>

    <app-toast-overlay />
    <app-confetti [visible]="confetti()" (done)="confetti.set(false)" />
    <app-tab-bar />
  `,
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  /** Single signal that exposes whether confetti should be playing right now.
   *  A future agent's Today screen can call `triggerConfetti()` after marking
   *  the last remaining habit done. */
  readonly confetti = signal(false);

  /** Kept here so the ToastService is eagerly instantiated with the shell. */
  protected readonly toast = inject(ToastService);

  triggerConfetti(): void {
    this.confetti.set(true);
  }
}
