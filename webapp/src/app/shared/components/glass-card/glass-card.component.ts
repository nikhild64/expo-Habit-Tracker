import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * GlassCardComponent — port of src/components/ui/GlassCard.tsx for the web.
 *
 * Uses `backdrop-filter: blur(20px) saturate(180%)` + a 75%-alpha surface
 * overlay so content underneath shows through with a frosted feel
 * (matches the iOS systemMaterial blur on the mobile app).
 *
 * The `-webkit-backdrop-filter` fallback in glass-card.component.scss
 * keeps Safari < 16 working; older Android Chromium falls back to the
 * underlying tinted background.
 */
@Component({
  selector: 'app-glass-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="glass" [class.compact]="compact()">
      <ng-content />
    </div>
  `,
  styleUrl: './glass-card.component.scss',
})
export class GlassCardComponent {
  readonly compact = input<boolean>(false);
}
