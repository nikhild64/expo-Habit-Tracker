import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Display duration in ms. Defaults: success/info 3500, error 5000. */
  duration?: number;
};

export type ShowOpts = {
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
};

let _id = 0;
const newId = () => `t_${++_id}_${Date.now()}`;

const defaultDuration = (kind: ToastKind): number =>
  kind === 'error' ? 5000 : 3500;

/**
 * ToastService — port of src/contexts/ToastContext.tsx.
 *
 * Single-toast model: at most one toast is rendered at a time.  When
 * `show()` is called while a toast is already up, the new one is queued and
 * appears 220 ms after the previous one dismisses (matches the mobile app's
 * exit animation timing).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  /** Currently-visible toast, or null when none. Subscribed by ToastOverlay. */
  readonly current = signal<Toast | null>(null);

  private queue: Toast[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, kind: ToastKind, opts: ShowOpts = {}): void {
    const toast: Toast = {
      id: newId(),
      kind,
      message,
      actionLabel: opts.actionLabel,
      onAction: opts.onAction,
      duration: opts.duration,
    };
    if (this.current()) {
      this.queue.push(toast);
      return;
    }
    this.current.set(toast);
    this.armDismiss(toast);
  }

  success(message: string, opts?: ShowOpts): void { this.show(message, 'success', opts); }
  error(message: string, opts?: ShowOpts):   void { this.show(message, 'error',   opts); }
  info(message: string, opts?: ShowOpts):    void { this.show(message, 'info',    opts); }

  dismiss(): void {
    this.clearTimer();
    this.current.set(null);
    setTimeout(() => {
      const next = this.queue.shift();
      if (next) {
        this.current.set(next);
        this.armDismiss(next);
      }
    }, 220);
  }

  private armDismiss(toast: Toast): void {
    this.clearTimer();
    this.timer = setTimeout(() => this.dismiss(), toast.duration ?? defaultDuration(toast.kind));
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
