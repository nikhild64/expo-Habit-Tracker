import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * CardComponent — port of src/components/ui/Card.tsx.
 *
 * Just a styled surface with `--color-surface` background + 1-px border.
 * Use `[compact]="true"` for tighter padding (matches the mobile prop).
 * `[highlight]` overrides the border colour (used for completed routines,
 * unlocked achievements, etc.).
 *
 * Children are projected via `<ng-content>`.
 */
@Component({
  selector: 'app-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="card"
      [class.compact]="compact()"
      [style.border-color]="highlight() ?? null"
    >
      <ng-content />
    </div>
  `,
  styleUrl: './card.component.scss',
})
export class CardComponent {
  readonly compact = input<boolean>(false);
  readonly highlight = input<string | undefined>(undefined);
}
