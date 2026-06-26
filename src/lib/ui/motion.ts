/**
 * Reanimated 4 motion helpers — shared springs, timings, and presets so
 * animations across the app feel consistent.
 *
 * SDK 55 ships Reanimated 4.2 with shared element transitions; see
 * https://docs.expo.dev/versions/v55.0.0/sdk/reanimated/ before extending.
 */

import { Easing, withSpring, withTiming } from 'react-native-reanimated';
import type { WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';

export const SPRINGS = {
  /** Snappy press feedback */
  snappy:   { damping: 14, stiffness: 220, mass: 0.6 } satisfies WithSpringConfig,
  /** Default smooth motion */
  smooth:   { damping: 16, stiffness: 140, mass: 0.7 } satisfies WithSpringConfig,
  /** Bouncy celebration spring */
  bounce:   { damping: 8,  stiffness: 180, mass: 0.4 } satisfies WithSpringConfig,
  /** Gentle, slow */
  gentle:   { damping: 20, stiffness: 90,  mass: 0.8 } satisfies WithSpringConfig,
};

export const TIMINGS = {
  fast:     { duration: 150, easing: Easing.out(Easing.cubic)   } satisfies WithTimingConfig,
  normal:   { duration: 250, easing: Easing.out(Easing.quad)    } satisfies WithTimingConfig,
  slow:     { duration: 400, easing: Easing.inOut(Easing.cubic) } satisfies WithTimingConfig,
};

export const press = (v: number) => withSpring(v, SPRINGS.snappy);
export const fade = (v: number) => withTiming(v, TIMINGS.normal);
export const fadeFast = (v: number) => withTiming(v, TIMINGS.fast);
