/**
 * Accessibility helpers — reduce-motion hook, label builders, dev validators.
 *
 * Per the v2.1 plan, every Reanimated-driven animation should check
 * `useReduceMotion()` and degrade to an immediate static state when the user
 * has enabled the OS "Reduce motion" preference.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Returns `true` when the OS has reduce-motion enabled.
 * Subscribes to changes so the value updates live.
 */
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (active) setEnabled(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setEnabled);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return enabled;
}

/**
 * Returns `true` when a screen reader (VoiceOver / TalkBack) is active.
 * Useful for switching between visual-only and screen-reader-friendly layouts.
 */
export function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled().then(v => { if (active) setEnabled(v); });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return enabled;
}

/** Minimum recommended touch target side per WCAG 2.5.5 (Level AAA). */
export const MIN_TOUCH_TARGET = 44;

/**
 * Dev-only warning when a touch target is below the recommended 44x44.
 * Strip with `if (!__DEV__) return;` so production builds pay no cost.
 */
export function validateTouchTarget(width: number, height: number, name?: string): void {
  if (!__DEV__) return;
  if (width < MIN_TOUCH_TARGET || height < MIN_TOUCH_TARGET) {
    // eslint-disable-next-line no-console
    console.warn(
      `[a11y] Touch target${name ? ` "${name}"` : ''} is ${width}x${height} — ` +
      `below ${MIN_TOUCH_TARGET}x${MIN_TOUCH_TARGET} recommendation. Add hitSlop or bump size.`,
    );
  }
}

/**
 * Builds an `accessibilityLabel` string from a noun and optional state hints.
 * `a11yLabel('Drink Water', { done: true, streak: 7 })` →
 *   "Drink Water, done, 7 day streak"
 */
export function a11yLabel(
  noun: string,
  state?: { done?: boolean; streak?: number; pinned?: boolean },
): string {
  const parts: string[] = [noun];
  if (state?.done) parts.push('done');
  if (state?.pinned) parts.push('pinned');
  if (state?.streak && state.streak > 0) parts.push(`${state.streak} day streak`);
  return parts.join(', ');
}
