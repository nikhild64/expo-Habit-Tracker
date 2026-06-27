import { Injectable } from '@angular/core';

/**
 * HapticsService — a thin `navigator.vibrate` wrapper.
 *
 * - Silent on browsers without the Vibration API (Safari/iOS).
 * - Mirrors the Haptics calls scattered through the mobile UI primitives
 *   (Button press, Toast appearance, ContextMenu open, etc.).
 *
 * The mobile app uses Expo's Haptics module which gives finer-grained
 * impacts; on the web we collapse them all to a small set of vibration
 * patterns since most browsers ignore everything beyond the simplest call.
 */
@Injectable({ providedIn: 'root' })
export class HapticsService {
  private get supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  light(): void {
    if (this.supported) navigator.vibrate(10);
  }

  medium(): void {
    if (this.supported) navigator.vibrate(20);
  }

  heavy(): void {
    if (this.supported) navigator.vibrate(35);
  }

  selection(): void {
    if (this.supported) navigator.vibrate(5);
  }

  success(): void {
    if (this.supported) navigator.vibrate([10, 30, 10]);
  }

  error(): void {
    if (this.supported) navigator.vibrate([20, 60, 20]);
  }

  warning(): void {
    if (this.supported) navigator.vibrate([15, 40, 15]);
  }
}
