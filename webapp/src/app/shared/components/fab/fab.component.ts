import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';

import { HapticsService } from '../../../core/services/haptics.service';
import { IoniconComponent } from '../ionicon/ionicon.component';

/**
 * FabComponent — port of src/components/ui/FAB.tsx (simplified for Phase 1).
 *
 * Single-tap circular Floating Action Button. The mobile app also has a
 * long-press fan-out menu — that variant ships in a later phase once the
 * Today screen needs it (currently the mobile app doesn't render the FAB on
 * Today either).
 *
 * Positioned absolutely in the bottom-right by default; flip to
 * `position="bottomCenter"` for modal flows where there is no tab bar.
 */
@Component({
  selector: 'app-fab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    <button
      type="button"
      class="fab press"
      [class.center]="position() === 'bottomCenter'"
      [style.background-color]="color() ?? 'var(--color-tint)'"
      [attr.aria-label]="ariaLabel()"
      (click)="handlePress()"
    >
      <app-ionicon [name]="icon()" [size]="26" color="#fff" />
    </button>
  `,
  styleUrl: './fab.component.scss',
})
export class FabComponent {
  private readonly haptics = inject(HapticsService);

  readonly icon = input.required<string>();
  readonly color = input<string | undefined>(undefined);
  readonly position = input<'bottomRight' | 'bottomCenter'>('bottomRight');
  readonly ariaLabel = input<string>('Quick action');

  readonly pressed = output<void>();

  handlePress(): void {
    this.haptics.light();
    this.pressed.emit();
  }
}
