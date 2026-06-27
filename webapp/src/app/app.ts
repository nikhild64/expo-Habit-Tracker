import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { AppUpdatesService } from './core/services/app-updates.service';
import { HabitsService } from './core/services/habits.service';
import { NotificationsService } from './core/services/notifications.service';
import { PushTokenService } from './core/services/push-token.service';
import { ServiceWorkerBridgeService } from './core/services/service-worker-bridge.service';
import { ThemeService } from './core/services/theme.service';
import { ToastService } from './core/services/toast.service';
import { AppHeaderComponent } from './layout/app-header/app-header.component';
import { InstallPromptComponent } from './shared/components/install-prompt/install-prompt.component';

/**
 * Root <app-root> component.
 *
 * Thin wrapper around the router outlet, plus three always-on side
 * effects that are easier to anchor at the top of the component tree:
 *
 *   1. ThemeService injection — its `effect()` updates the `<html>`
 *      data attributes (`data-theme`, `data-accent`) that drive every
 *      CSS variable swap.
 *   2. Service worker postMessage bridge — translates the SW push
 *      handler's `NAVIGATE` / `HABIT_DONE_FROM_PUSH` / `SNOOZE_HABIT`
 *      messages into router + habit-service calls.
 *   3. SwUpdate toast — when a new app version activates, the user gets a
 *      one-tap Reload toast (also polls every 30 min for new deploys).
 *
 * The `<app-install-prompt>` floats globally above every screen and
 * self-hides when the PWA is already installed.
 *
 * The component also handles two URL query params produced by the SW:
 *   - `?markDone=<habitId>` on `/habit/:id` — auto-marks the habit done
 *     when the SW had to open a new window for the DONE action.
 *   - `?snooze=10` on `/habit/:id` — auto-snoozes via the backend when
 *     the SW had to open a new window for the SNOOZE action.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, AppHeaderComponent, InstallPromptComponent],
  template: `
    <app-app-header />
    <router-outlet />
    <app-install-prompt />
  `,
  styles: [`
    :host {
      display: block;
      min-height: calc(100dvh - var(--app-header-total));
    }
  `],
})
export class App implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly theme = inject(ThemeService);
  private readonly swBridge = inject(ServiceWorkerBridgeService);
  private readonly appUpdates = inject(AppUpdatesService);
  private readonly habits = inject(HabitsService);
  private readonly pushToken = inject(PushTokenService);
  private readonly toast = inject(ToastService);
  private readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Touching `notifications` here ensures its constructor runs and the
    // habits-change → schedule-sync effect wires itself in.
    void this.notifications;

    this.swBridge.start();
    this.appUpdates.start();
    this.handleDeepLinkQueryParams();
  }

  /**
   * The SW's push handler can navigate the browser to deep-link URLs with
   * `?markDone=1` (DONE action with no open window) or `?snooze=10`
   * (SNOOZE action with no open window). We honor those here, then strip
   * the param so a refresh doesn't re-trigger the action.
   */
  private handleDeepLinkQueryParams(): void {
    if (typeof window === 'undefined') return;
    // Read the raw URL once — Router events for query params on the deep
    // route haven't fired yet at this point during boot.
    const url = new URL(window.location.href);
    const markDone = url.searchParams.get('markDone');
    const snooze = url.searchParams.get('snooze');
    if (!markDone && !snooze) return;

    // Extract the habit id from a path like `/habit/<id>`. Falls back to
    // no-op if the param is set but the URL isn't a habit route.
    const habitId = url.pathname.startsWith('/habit/')
      ? decodeURIComponent(url.pathname.slice('/habit/'.length).split('/')[0])
      : null;
    if (!habitId) return;

    // Defer one tick so HabitsService.loadFresh() has time to populate.
    setTimeout(async () => {
      if (markDone) {
        const habit = this.habits.habits().find(h => h.id === habitId);
        if (habit) {
          const res = await this.habits.markDone(habitId);
          if (res.wasAdded) this.toast.success(`${habit.name} marked done`);
        }
      }
      if (snooze) {
        const minutes = Number.parseInt(snooze, 10) || 10;
        await this.pushToken.snooze(habitId, minutes);
        this.toast.info(`Snoozed for ${minutes} min`);
      }
      // Strip the param so a refresh doesn't re-trigger.
      url.searchParams.delete('markDone');
      url.searchParams.delete('snooze');
      const cleaned = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '');
      void this.router.navigateByUrl(cleaned, { replaceUrl: true });
    }, 250);
  }
}
