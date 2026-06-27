import {
  Directive,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
} from '@angular/core';

import { HapticsService } from '../../core/services/haptics.service';

/**
 * LongPressDirective — pointer-event-based long-press detector.
 *
 * Default delay 400 ms (matches the mobile ContextMenu trigger).
 * For drag-start use 200 ms via `[appLongPressDelay]="200"`.
 *
 * Works with mouse, touch, and pen (Pointer Events). Suppresses the
 * trigger when the user has moved their finger more than 8 px (a typical
 * "I'm starting a scroll" threshold) — same heuristic the mobile uses.
 *
 * Usage:
 *   <div appLongPress (longPress)="onLongPress()">…</div>
 *   <div appLongPress [appLongPressDelay]="200" (longPress)="startDrag()">…</div>
 */
@Directive({
  selector: '[appLongPress]',
  standalone: true,
})
export class LongPressDirective {
  /** Delay in ms before the long-press fires (default 400). */
  readonly appLongPressDelay = input<number>(400);
  /** Cancel the press if the pointer moves more than this many pixels. */
  readonly appLongPressMoveThreshold = input<number>(8);
  /** Disable temporarily (e.g. while the parent is in drag mode). */
  readonly appLongPressDisabled = input<boolean>(false);

  readonly longPress = output<PointerEvent>();

  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly haptics = inject(HapticsService);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private startX = 0;
  private startY = 0;

  @HostListener('pointerdown', ['$event'])
  onPointerDown(e: PointerEvent): void {
    if (this.appLongPressDisabled()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.haptics.medium();
      this.longPress.emit(e);
    }, this.appLongPressDelay());
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(e: PointerEvent): void {
    if (!this.timer) return;
    const dx = Math.abs(e.clientX - this.startX);
    const dy = Math.abs(e.clientY - this.startY);
    if (dx > this.appLongPressMoveThreshold() || dy > this.appLongPressMoveThreshold()) {
      this.cancel();
    }
  }

  @HostListener('pointerup')
  @HostListener('pointercancel')
  @HostListener('pointerleave')
  onPointerEnd(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
