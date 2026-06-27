import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  HostListener,
} from '@angular/core';

/**
 * SheetComponent — port of src/components/ui/Sheet.tsx.
 *
 * Static bottom-anchored modal — opens, doesn't snap, doesn't drag. Used
 * by note-edit, clock picker, confirmations that want full keyboard
 * avoidance. (For draggable snap-point sheets, see `BottomSheetComponent`.)
 *
 * Escape key dismisses; tap on the backdrop dismisses; the sheet itself
 * stops propagation so taps inside don't close.
 */
@Component({
  selector: 'app-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTrapFocus],
  template: `
    @if (visible()) {
      <div class="overlay" (click)="onClose()" role="dialog" aria-modal="true">
        <div
          class="sheet"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (click)="$event.stopPropagation()"
        >
          <div class="handle" aria-hidden="true"></div>
          <ng-content />
        </div>
      </div>
    }
  `,
  styleUrl: './sheet.component.scss',
})
export class SheetComponent {
  readonly visible = input<boolean>(false);
  readonly closed = output<void>();

  onClose(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible()) this.onClose();
  }
}
