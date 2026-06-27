import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * BottomSheetComponent — port of src/components/ui/BottomSheet.tsx.
 *
 * Snap-point sheet:
 *  - `[snapPoints]` is an ascending array of fractions of the viewport
 *    height. Default `[0.4, 0.9]` matches the mobile.
 *  - Drag handle (the top 24-px strip) uses Pointer Events so iOS Safari
 *    PWAs in standalone mode work too.
 *  - Release snaps to the nearest point with velocity bias.
 *  - Drag below `min × 0.5` OR a fast downward fling (`velocity < -1500`)
 *    closes the sheet (mirrors the mobile fling-close behavior).
 *  - Escape key dismisses; backdrop click dismisses.
 *
 * Implementation note: Phase 1 ships the structural sheet + backdrop +
 * snap math; the drag math uses native pointer events instead of Hammer.js
 * so the bundle stays small.
 */
@Component({
  selector: 'app-bottom-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTrapFocus],
  template: `
    @if (visible()) {
      <div class="root" role="dialog" aria-modal="true">
        <div
          class="backdrop"
          [style.opacity]="backdropOpacity()"
          (click)="closeNow()"
        ></div>
        <div
          class="sheet"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          [style.height.px]="currentHeight()"
          (click)="$event.stopPropagation()"
        >
          <div
            class="handle-area"
            (pointerdown)="onPointerDown($event)"
            (pointermove)="onPointerMove($event)"
            (pointerup)="onPointerUp($event)"
            (pointercancel)="onPointerUp($event)"
          >
            <div class="handle" aria-hidden="true"></div>
          </div>
          <div class="content">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
  styleUrl: './bottom-sheet.component.scss',
})
export class BottomSheetComponent {
  readonly visible = input<boolean>(false);
  readonly snapPoints = input<number[]>([0.4, 0.9]);
  readonly initialSnap = input<number>(0);

  readonly closed = output<void>();

  private readonly currentHeightSignal = signal(0);
  readonly currentHeight = computed(() => this.currentHeightSignal());
  readonly backdropOpacity = computed(() => {
    const max = this.heightPx().slice(-1)[0] ?? 1;
    return Math.min(0.6, (this.currentHeight() / max) * 0.6);
  });

  private readonly heightPxSignal = signal<number[]>([0]);
  readonly heightPx = computed(() => this.heightPxSignal());

  private dragStartY = 0;
  private dragStartHeight = 0;
  private lastMoveAt = 0;
  private lastMoveY = 0;
  private velocity = 0;
  private dragging = false;

  constructor() {
    effect(() => {
      if (typeof window === 'undefined') return;
      const vh = window.innerHeight;
      const px = this.snapPoints().map(p => Math.round(p * vh));
      this.heightPxSignal.set(px);
      if (this.visible()) {
        const initial = px[Math.min(this.initialSnap(), px.length - 1)] ?? px[0];
        this.currentHeightSignal.set(initial);
      } else {
        this.currentHeightSignal.set(0);
      }
    });
  }

  closeNow(): void {
    this.currentHeightSignal.set(0);
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible()) this.closeNow();
  }

  onPointerDown(e: PointerEvent): void {
    this.dragging = true;
    this.dragStartY = e.clientY;
    this.dragStartHeight = this.currentHeight();
    this.lastMoveAt = performance.now();
    this.lastMoveY = e.clientY;
    this.velocity = 0;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const dy = e.clientY - this.dragStartY;
    const next = Math.max(0, this.dragStartHeight - dy);
    this.currentHeightSignal.set(next);

    const now = performance.now();
    const dt = now - this.lastMoveAt;
    if (dt > 0) {
      // velocity in px/sec — POSITIVE means moving downward
      this.velocity = ((e.clientY - this.lastMoveY) / dt) * 1000;
    }
    this.lastMoveAt = now;
    this.lastMoveY = e.clientY;
  }

  onPointerUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);

    const heights = this.heightPx();
    const minSnap = heights[0];
    const cur = this.currentHeight();
    // Fling-close threshold: matches the mobile `velocity < -1500` rule
    // (-1500 means "moving up at 1500px/s" in the mobile coords; here, after
    // the sign flip, fast-down equals velocity > 1500).
    if (cur < minSnap * 0.5 || this.velocity > 1500) {
      this.closeNow();
      return;
    }

    // Snap to nearest with velocity bias.
    const projected = cur - this.velocity * 0.1;
    let nearest = heights[0];
    let nearestDist = Math.abs(heights[0] - projected);
    for (let i = 1; i < heights.length; i++) {
      const d = Math.abs(heights[i] - projected);
      if (d < nearestDist) {
        nearest = heights[i];
        nearestDist = d;
      }
    }
    this.currentHeightSignal.set(nearest);
  }
}
