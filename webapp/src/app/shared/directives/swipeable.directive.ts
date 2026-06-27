import {
  Directive,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  Renderer2,
} from '@angular/core';

import { HapticsService } from '../../core/services/haptics.service';

export type SwipeDirection = 'left' | 'right';

/**
 * SwipeableDirective — Pointer Events based swipe-to-reveal helper.
 *
 * Mirrors the mobile `Swipeable` component used on the Today list:
 *  - The host element is dragged horizontally with `transform: translateX(…)`.
 *  - A reveal threshold of 40 px (same as the mobile) decides whether to
 *    snap open or back to rest on release.
 *  - When opened, `swipeOpen` fires with the direction (`left | right`).
 *  - When released past 96 px (the action panel width), `swipeAction` fires
 *    so the parent can commit the action (delete, archive, …).
 *  - Touch / mouse / pen all supported via Pointer Events — works inside an
 *    installed iOS Safari PWA which doesn't dispatch Touch events reliably.
 *
 * The directive doesn't draw the action panel; the parent template should
 * render it absolutely-positioned behind the swipeable surface.
 */
@Directive({
  selector: '[appSwipeable]',
  standalone: true,
})
export class SwipeableDirective {
  /** Per-side reveal threshold (px) before considering the gesture an open. */
  readonly appSwipeRevealAt = input<number>(40);
  /** Full-action threshold (px) — when crossed on release, action fires. */
  readonly appSwipeActionAt = input<number>(96);
  /** Allowed sides. Defaults to right-side reveal only (delete pattern). */
  readonly appSwipeDirections = input<SwipeDirection[]>(['left']);

  readonly swipeStart = output<void>();
  readonly swipeChange = output<number>(); // current translateX (signed)
  readonly swipeOpen = output<SwipeDirection>();
  readonly swipeClose = output<void>();
  readonly swipeAction = output<SwipeDirection>();

  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly haptics = inject(HapticsService);

  private dragging = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private opened = false;

  @HostListener('pointerdown', ['$event'])
  onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.dragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.currentX = 0;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    this.swipeStart.emit();
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    // If the user is clearly scrolling vertically, abandon the gesture.
    if (Math.abs(dy) > Math.abs(dx) + 8) {
      this.cancel();
      return;
    }
    // Constrain to allowed directions.
    const allowed = this.appSwipeDirections();
    if (dx < 0 && !allowed.includes('left'))  return;
    if (dx > 0 && !allowed.includes('right')) return;
    this.currentX = dx;
    this.applyTransform(dx);
    this.swipeChange.emit(dx);
  }

  @HostListener('pointerup', ['$event'])
  @HostListener('pointercancel', ['$event'])
  onPointerUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);

    const dx = this.currentX;
    const absDx = Math.abs(dx);
    const dir: SwipeDirection = dx < 0 ? 'left' : 'right';

    if (absDx >= this.appSwipeActionAt()) {
      this.haptics.medium();
      this.swipeAction.emit(dir);
      this.snapClose();
      return;
    }
    if (absDx >= this.appSwipeRevealAt()) {
      this.opened = true;
      this.snapTo(dir === 'left' ? -this.appSwipeActionAt() : this.appSwipeActionAt());
      this.swipeOpen.emit(dir);
      return;
    }
    this.snapClose();
  }

  private cancel(): void {
    this.dragging = false;
    this.snapClose();
  }

  private applyTransform(px: number): void {
    this.renderer.setStyle(this.hostRef.nativeElement, 'transform', `translateX(${px}px)`);
  }

  private snapTo(px: number): void {
    this.renderer.setStyle(
      this.hostRef.nativeElement,
      'transition',
      `transform var(--dur-normal) var(--ease-snappy)`,
    );
    this.applyTransform(px);
    setTimeout(() => {
      this.renderer.removeStyle(this.hostRef.nativeElement, 'transition');
    }, 280);
  }

  private snapClose(): void {
    this.opened = false;
    this.currentX = 0;
    this.snapTo(0);
    this.swipeClose.emit();
  }
}
