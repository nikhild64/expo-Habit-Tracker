import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
} from '@angular/core';

import { ButtonComponent } from '../button/button.component';
import { IoniconComponent } from '../ionicon/ionicon.component';

/**
 * ConfirmationComponent — port of src/components/ui/Confirmation.tsx.
 *
 * Bottom-anchored modal with up to 2 buttons (Cancel + Confirm). Use
 * everywhere the mobile app uses `Alert.alert(…)` for soft confirmations
 * (pause habit, unlock accent, etc.).
 *
 * For destructive actions like "Delete habit", the icon defaults to
 * `trash-outline` and the confirm button picks up the `danger` variant
 * by setting `[destructive]="true"`.
 */
@Component({
  selector: 'app-confirmation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, IoniconComponent, CdkTrapFocus],
  template: `
    @if (visible()) {
      <div class="backdrop" role="dialog" aria-modal="true" (click)="onClose()">
        <div class="safe">
          <div
            class="card"
            cdkTrapFocus
            [cdkTrapFocusAutoCapture]="true"
            (click)="$event.stopPropagation()"
          >
            <div
              class="icon-wrap"
              [style.background-color]="(iconColor() ?? 'var(--color-tint)') + '22'"
            >
              <app-ionicon [name]="icon()" [size]="24" [color]="iconColor() ?? 'var(--color-tint)'" />
            </div>
            <h3 class="title">{{ title() }}</h3>
            @if (message()) {
              <p class="message">{{ message() }}</p>
            }
            <div class="actions">
              <app-button
                [label]="cancelLabel()"
                variant="secondary"
                [fullWidth]="true"
                (pressed)="onClose()"
              />
              <app-button
                [label]="confirmLabel()"
                [variant]="destructive() ? 'danger' : 'primary'"
                [fullWidth]="true"
                hapticImpact="medium"
                (pressed)="onConfirm()"
              />
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styleUrl: './confirmation.component.scss',
})
export class ConfirmationComponent {
  readonly visible = input<boolean>(false);
  readonly title = input.required<string>();
  readonly message = input<string | undefined>(undefined);
  readonly icon = input<string>('help-circle');
  readonly iconColor = input<string | undefined>(undefined);
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input<string>('Cancel');
  readonly destructive = input<boolean>(false);

  readonly closed = output<void>();
  readonly confirmed = output<void>();

  onClose(): void {
    this.closed.emit();
  }

  onConfirm(): void {
    this.confirmed.emit();
    this.onClose();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible()) this.onClose();
  }
}
