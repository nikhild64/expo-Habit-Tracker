import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';

import { HapticsService } from '../../../core/services/haptics.service';
import { IoniconComponent } from '../ionicon/ionicon.component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonHaptic = 'light' | 'medium' | 'heavy' | 'none';

/**
 * ButtonComponent — port of src/components/ui/Button.tsx.
 *
 * Press-scale 0.97 via the `.press` CSS class (snappy spring-equivalent).
 * Variants map straight to the design tokens — primary uses --color-tint,
 * danger uses --color-danger, etc.
 */
@Component({
  selector: 'app-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    <button
      type="button"
      class="press"
      [class.full-width]="fullWidth()"
      [class.is-loading]="loading()"
      [attr.data-variant]="variant()"
      [disabled]="disabled() || loading()"
      [attr.aria-label]="ariaLabel() ?? label()"
      (click)="handlePress()"
    >
      @if (loading()) {
        <span class="spinner" role="progressbar" aria-label="Loading"></span>
      } @else {
        <span class="inner">
          @if (icon()) {
            <app-ionicon [name]="icon()!" [size]="18" />
          }
          <span class="label">{{ label() }}</span>
          @if (iconRight()) {
            <app-ionicon [name]="iconRight()!" [size]="18" />
          }
        </span>
      }
    </button>
  `,
  styleUrl: './button.component.scss',
})
export class ButtonComponent {
  private readonly haptics = inject(HapticsService);

  readonly label = input.required<string>();
  readonly variant = input<ButtonVariant>('primary');
  readonly icon = input<string | undefined>(undefined);
  readonly iconRight = input<string | undefined>(undefined);
  readonly loading = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
  readonly hapticImpact = input<ButtonHaptic>('light');
  readonly ariaLabel = input<string | undefined>(undefined);

  readonly pressed = output<void>();

  /** For tests / parent layouts that read the resolved variant. */
  readonly resolvedVariant = computed(() => this.variant());

  handlePress(): void {
    if (this.loading() || this.disabled()) return;
    switch (this.hapticImpact()) {
      case 'light':  this.haptics.light();  break;
      case 'medium': this.haptics.medium(); break;
      case 'heavy':  this.haptics.heavy();  break;
      case 'none':   break;
    }
    this.pressed.emit();
  }
}
