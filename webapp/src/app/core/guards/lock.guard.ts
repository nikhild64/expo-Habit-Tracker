import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { LockService } from '../services/lock.service';

/**
 * LockGuard — redirects to `/lock` when LockService reports `locked()` true.
 *
 * Whitelisted routes (`/lock` itself + any sub-route under it) bypass the
 * guard so the lock screen can render the keypad without ricocheting.
 */
export const lockGuard: CanActivateFn = (route, state) => {
  const lockService = inject(LockService);
  const router = inject(Router);

  // Never gate the lock screen itself — would loop forever.
  if (state.url.startsWith('/lock')) return true;
  if (!lockService.locked()) return true;

  return router.parseUrl('/lock');
};
