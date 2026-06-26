/**
 * Wraps `React.lazy` with a sensible default suspense fallback so heavy screens
 * (Insights, Year-in-Review, Shop, Timer) can be split out of the initial bundle.
 *
 * Usage:
 *   const LazyInsights = lazyScreen(() => import('./insights'));
 *   <Stack.Screen name="insights" component={LazyInsights} />
 *
 * The fallback uses the existing `SkeletonGroup` primitive so the user sees a
 * shimmering placeholder, not a blank screen, while the chunk downloads.
 */
import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';

import { SkeletonGroup } from '@/components/ui/Skeleton';

export function lazyScreen<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
): ComponentType<P> {
  const Lazy = lazy(loader);
  return function LazyScreen(props: P) {
    return (
      <Suspense fallback={<SkeletonGroup />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
