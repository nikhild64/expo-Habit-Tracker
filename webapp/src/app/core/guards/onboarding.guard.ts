import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { OnboardingService } from '../services/onboarding.service';

/**
 * OnboardingGuard — redirects to `/onboarding` when the user has not yet
 * completed the 6-slide pager.
 *
 * Whitelists `/onboarding` itself (so the page can render).
 *
 * On the very first navigation after a hard reload the IDB read inside
 * `OnboardingService.load()` is still pending, so the guard returns a
 * Promise that resolves once `ready()` flips true. That keeps the URL
 * authoritative (the user always lands on `/onboarding` on a fresh
 * install rather than briefly flashing the Today screen).
 */
export const onboardingGuard: CanActivateFn = (_route, state) => {
  const onboarding = inject(OnboardingService);
  const router = inject(Router);

  if (state.url.startsWith('/onboarding')) return true;

  const decide = () => {
    if (onboarding.seen()) return true;
    return router.parseUrl('/onboarding');
  };

  if (onboarding.ready()) return decide();

  // Storage hasn't been read yet — poll briefly. The load is a single IDB
  // round-trip + a `set()` on the signal so this resolves in a few ms in
  // practice. Cap at 2 s so a hung storage layer doesn't lock the user out.
  return new Promise<ReturnType<typeof decide>>(resolve => {
    const start = Date.now();
    const tick = () => {
      if (onboarding.ready() || Date.now() - start > 2000) {
        resolve(decide());
        return;
      }
      setTimeout(tick, 16);
    };
    tick();
  });
};
