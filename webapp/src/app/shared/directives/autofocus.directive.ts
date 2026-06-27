import {
  AfterViewInit,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';

/**
 * AutofocusDirective — focuses the host element after view init.
 *
 * Used by the Today note-sheet textarea and the habit-form name input.
 * `[appAutofocusDelay]` lets the parent stagger the focus call so the
 * keyboard rises after the sheet's enter animation finishes (matches the
 * mobile InputAccessoryView dance).
 */
@Directive({
  selector: '[appAutofocus]',
  standalone: true,
})
export class AutofocusDirective implements AfterViewInit {
  readonly appAutofocusDelay = input<number>(0);

  private readonly hostRef = inject(ElementRef<HTMLElement>);

  ngAfterViewInit(): void {
    const el = this.hostRef.nativeElement;
    setTimeout(() => {
      try {
        el.focus({ preventScroll: false });
      } catch {
        // ignore
      }
    }, this.appAutofocusDelay());
  }
}
