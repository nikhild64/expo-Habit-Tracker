import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';

import { HapticsService } from '../../../core/services/haptics.service';
import { ToastService } from '../../../core/services/toast.service';
import { IoniconComponent } from '../ionicon/ionicon.component';

const KIND_META = {
  success: { icon: 'checkmark-circle',   tint: '#10B981' },
  error:   { icon: 'alert-circle',       tint: '#EF4444' },
  info:    { icon: 'information-circle', tint: '#3B82F6' },
} as const;

/**
 * ToastOverlayComponent — port of src/components/ui/Toast.tsx.
 *
 * Reads `ToastService.current` and floats the active toast just above the
 * tab bar. Subscribes via the signal — no manual change detection needed
 * thanks to Angular 21's zoneless default.
 *
 *  - `role="status"` / `aria-live="polite"` for success/info.
 *  - `role="alert"`  / `aria-live="assertive"` for errors.
 *  - Haptic on appearance: success/error/warning patterns from HapticsService.
 */
@Component({
  selector: 'app-toast-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    @if (toast(); as t) {
      <div class="safe">
        <div class="wrap">
          <div
            class="toast"
            [attr.role]="t.kind === 'error' ? 'alert' : 'status'"
            [attr.aria-live]="t.kind === 'error' ? 'assertive' : 'polite'"
          >
            <app-ionicon
              [name]="meta(t.kind).icon"
              [size]="20"
              [color]="meta(t.kind).tint"
            />
            <span class="message">{{ t.message }}</span>
            @if (t.actionLabel) {
              <button
                type="button"
                class="action"
                [style.color]="meta(t.kind).tint"
                (click)="onAction()"
                [attr.aria-label]="t.actionLabel"
              >
                {{ t.actionLabel }}
              </button>
            }
            <button
              type="button"
              class="dismiss"
              (click)="dismiss()"
              aria-label="Dismiss"
            >
              <app-ionicon name="close" [size]="16" color="var(--color-text-muted)" />
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styleUrl: './toast-overlay.component.scss',
})
export class ToastOverlayComponent {
  private readonly toastSvc = inject(ToastService);
  private readonly haptics = inject(HapticsService);

  readonly toast = computed(() => this.toastSvc.current());

  meta(kind: 'success' | 'error' | 'info') {
    return KIND_META[kind];
  }

  constructor() {
    // Haptic ping whenever a new toast appears.
    let prevId: string | null = null;
    effect(() => {
      const t = this.toast();
      if (!t || t.id === prevId) return;
      prevId = t.id;
      switch (t.kind) {
        case 'success': this.haptics.success(); break;
        case 'error':   this.haptics.error();   break;
        case 'info':    this.haptics.warning(); break;
      }
    });
  }

  dismiss(): void {
    this.toastSvc.dismiss();
  }

  onAction(): void {
    const t = this.toast();
    if (!t) return;
    t.onAction?.();
    this.toastSvc.dismiss();
  }
}
