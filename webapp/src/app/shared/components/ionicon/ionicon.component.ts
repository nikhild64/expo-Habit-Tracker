import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  input,
} from '@angular/core';

/**
 * Tiny wrapper around the `<ion-icon>` web component.
 *
 * The Ionicons script tag is loaded in index.html, so `<ion-icon name="…">`
 * works anywhere. We wrap it so:
 *  - Sizing/coloring stays consistent (24 px default, currentColor).
 *  - CUSTOM_ELEMENTS_SCHEMA stays scoped to this component instead of
 *    leaking out to every consumer.
 *  - Future swaps (e.g. inlining SVGs) only touch one file.
 */
@Component({
  selector: 'app-ionicon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ion-icon
      [attr.name]="name()"
      [style.font-size.px]="size()"
      [style.color]="color() ?? 'currentColor'"
      [attr.aria-hidden]="ariaLabel() ? null : 'true'"
      [attr.aria-label]="ariaLabel() ?? null"
      [attr.role]="ariaLabel() ? 'img' : null"
    ></ion-icon>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    ion-icon {
      display: inline-block;
      line-height: 0;
    }
  `],
})
export class IoniconComponent {
  readonly name = input.required<string>();
  readonly size = input<number>(24);
  readonly color = input<string | undefined>(undefined);
  readonly ariaLabel = input<string | undefined>(undefined);

  /** Convenience computed for downstream styling reference. */
  readonly resolvedColor = computed(() => this.color() ?? 'currentColor');
}
