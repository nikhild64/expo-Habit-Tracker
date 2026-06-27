import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Renderer2,
  computed,
  effect,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';

import { ThemeService } from '../../core/services/theme.service';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

/**
 * AppHeaderComponent — global, fixed brand header that sits above every
 * route as the user-visible anchor for "I'm in Habitly".
 *
 * Layered intentionally so it mirrors the bottom `<app-tab-bar>`:
 *  - `position: fixed; top: 0; z-index: 100` (same z-index as the tab bar
 *    so overlay components — sheet, confirmation, context-menu, toast,
 *    all of which sit at 1000+ — composite cleanly on top of both).
 *  - 48 px + safe-area-inset-top tall: slim enough to not dominate.
 *  - Glass surface (`backdrop-filter: blur(20px) saturate(180%)` + 75 %
 *    alpha overlay) + a single 1-px hairline on the BOTTOM edge.
 *  - Left: a 28 × 28 brand tile (orange, rounded-8) with a white leaf
 *    icon, plus the "Habitly" wordmark.
 *  - Right: an icon-only theme toggle (moon when light, sunny when dark)
 *    that calls `ThemeService.toggleTheme()`.
 *
 * Visibility:
 *   The header is hidden on `/onboarding` (immersive flow) and `/lock`
 *   (security/focus). The same signal that hides the chrome also toggles
 *   a `no-app-header` class on `<body>`, which `styles.scss` reads to
 *   zero out the global `padding-top` and the `--app-header-total`
 *   variable — so those full-bleed screens claim the entire viewport
 *   without any negative-margin tricks.
 */
const FULL_BLEED_ROUTES = ['/onboarding', '/lock'] as const;

@Component({
  selector: 'app-app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
})
export class AppHeaderComponent {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);

  protected readonly theme = inject(ThemeService);

  /** Latest activated URL (post-redirect), updated on every NavigationEnd. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** `false` on the full-bleed onboarding / lock routes; `true` everywhere
   *  else (tab routes + every stack route). */
  readonly visible = computed(() => {
    const u = this.url();
    return !FULL_BLEED_ROUTES.some(prefix => u === prefix || u.startsWith(`${prefix}/`) || u.startsWith(`${prefix}?`));
  });

  /** Tooltip / aria-label for the theme toggle (reads `next` action so a
   *  screen reader announces what tapping will do). */
  protected readonly toggleLabel = computed(() =>
    this.theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme',
  );

  constructor() {
    // Reflect visibility onto `<body>` so the global body padding-top
    // can be zero'd out on full-bleed routes without each page having to
    // override it locally.
    effect(() => {
      const body = this.document.body;
      if (!body) return;
      if (this.visible()) {
        this.renderer.removeClass(body, 'no-app-header');
      } else {
        this.renderer.addClass(body, 'no-app-header');
      }
    });
  }
}
