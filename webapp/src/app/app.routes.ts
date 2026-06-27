import { Routes } from '@angular/router';

import { lockGuard, onboardingGuard } from './core/guards';
import { ShellComponent } from './layout/shell/shell.component';

/**
 * Route graph for the Habitly PWA — mirrors §13 of the plan.
 *
 * Tab routes (`/`, `/progress`, `/profile`, `/settings`) sit inside the
 * `ShellComponent` so the shared header + tab bar render once. All other
 * full-screen routes (`/new`, `/habit/:id`, `/timer/:id`, …) live outside
 * the shell so they can hide the tab bar without re-layout.
 *
 * Lazy `loadComponent` is used everywhere — Angular code-splits each page
 * into its own chunk, matching what `expo-router` did with its file-based
 * routing on the mobile app.
 *
 * Phase 1 ships:
 *   - 4 placeholder tab routes (Today, Progress, Profile, Settings).
 *   - Both guards wired (LockGuard + OnboardingGuard).
 *
 * The screen pages themselves (today / progress / profile / settings) are
 * placeholders rendering an EmptyState until the follow-up agents land.
 */
export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    canActivate: [lockGuard, onboardingGuard],
    children: [
      { path: '',         loadComponent: () => import('./features/today/today.page')       },
      { path: 'progress', loadComponent: () => import('./features/progress/progress.page') },
      { path: 'profile',  loadComponent: () => import('./features/profile/profile.page')   },
      { path: 'settings', loadComponent: () => import('./features/settings/settings.page') },
    ],
  },

  // ── stack routes (D) ───────────────────────────────────────────────────
  // Full-screen routes (no tab bar) for the habit / routine / timer /
  // journal / templates flows. Owned by the habit-form-detail,
  // routines-timer, and journal-templates todos.
  { path: 'new',           loadComponent: () => import('./features/habit-form/habit-form.page').then(m => m.HabitFormPage)         },
  { path: 'habit/:id',     loadComponent: () => import('./features/habit-detail/habit-detail.page').then(m => m.HabitDetailPage)   },
  { path: 'routine/:id',   loadComponent: () => import('./features/routine-detail/routine-detail.page').then(m => m.RoutineDetailPage) },
  { path: 'new-routine',   loadComponent: () => import('./features/routine-form/routine-form.page').then(m => m.RoutineFormPage)   },
  { path: 'timer/:id',     loadComponent: () => import('./features/timer/timer.page').then(m => m.TimerPage)                       },
  { path: 'journal/:date', loadComponent: () => import('./features/journal/journal.page').then(m => m.JournalPage)                 },
  { path: 'templates',     loadComponent: () => import('./features/templates/templates.page').then(m => m.TemplatesPage)           },
  // ── end stack routes (D) ───────────────────────────────────────────────

  // ── stack routes (E) ───────────────────────────────────────────────────
  // Full-screen routes outside the ShellComponent so they bypass the glass
  // tab bar. /onboarding and /lock deliberately also bypass the guards
  // (they ARE the gating screens) — note the explicit empty `canActivate`
  // arrays below. The rest of the stack routes inherit guard protection.
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./features/onboarding/onboarding.page').then(m => m.default),
  },
  {
    path: 'lock',
    loadComponent: () =>
      import('./features/lock/lock.page').then(m => m.default),
  },
  {
    path: 'insights',
    canActivate: [lockGuard, onboardingGuard],
    loadComponent: () =>
      import('./features/insights/insights.page').then(m => m.default),
  },
  {
    path: 'shop',
    canActivate: [lockGuard, onboardingGuard],
    loadComponent: () =>
      import('./features/shop/shop.page').then(m => m.default),
  },
  {
    path: 'weekly-review',
    canActivate: [lockGuard, onboardingGuard],
    loadComponent: () =>
      import('./features/weekly-review/weekly-review.page').then(m => m.default),
  },
  {
    path: 'year-in-review',
    canActivate: [lockGuard, onboardingGuard],
    loadComponent: () =>
      import('./features/year-in-review/year-in-review.page').then(m => m.default),
  },
  {
    path: 'summary',
    canActivate: [lockGuard, onboardingGuard],
    loadComponent: () =>
      import('./features/summary/summary.page').then(m => m.default),
  },
  {
    path: 'about',
    canActivate: [lockGuard, onboardingGuard],
    loadComponent: () =>
      import('./features/about/about.page').then(m => m.default),
  },
  {
    path: 'privacy',
    canActivate: [lockGuard, onboardingGuard],
    loadComponent: () =>
      import('./features/privacy/privacy.page').then(m => m.default),
  },

  { path: '**', redirectTo: '' },
];
