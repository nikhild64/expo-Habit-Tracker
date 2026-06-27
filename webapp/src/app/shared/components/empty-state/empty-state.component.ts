import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

import { ButtonComponent } from '../button/button.component';
import { IoniconComponent } from '../ionicon/ionicon.component';

export type EmptyStateAction = {
  label: string;
  icon?: string;
};

/**
 * EmptyStateComponent — port of src/components/ui/EmptyState.tsx.
 *
 * 80 px round badge + title + body + optional primary/secondary actions.
 * Used by the Today screen, Templates page, Settings → Archived Habits,
 * Routine detail, etc. for the "nothing here yet" state.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent, ButtonComponent],
  template: `
    <div class="wrap">
      <div class="icon-wrap">
        <app-ionicon [name]="icon()" [size]="36" color="var(--color-text-muted)" />
      </div>
      <h3 class="title">{{ title() }}</h3>
      @if (body()) {
        <p class="body">{{ body() }}</p>
      }
      @if (primaryAction(); as a) {
        <div class="primary">
          <app-button
            [label]="a.label"
            [icon]="a.icon"
            (pressed)="primaryPressed.emit()"
          />
        </div>
      }
      @if (secondaryAction(); as b) {
        <app-button
          [label]="b.label"
          [icon]="b.icon"
          variant="secondary"
          (pressed)="secondaryPressed.emit()"
        />
      }
    </div>
  `,
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly body = input<string | undefined>(undefined);
  readonly primaryAction = input<EmptyStateAction | undefined>(undefined);
  readonly secondaryAction = input<EmptyStateAction | undefined>(undefined);

  readonly primaryPressed = output<void>();
  readonly secondaryPressed = output<void>();
}
