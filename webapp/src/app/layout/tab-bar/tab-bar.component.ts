import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

type Tab = {
  path: string;
  exact: boolean;
  label: string;
  iconActive: string;
  iconInactive: string;
};

const TABS: Tab[] = [
  { path: '/',         exact: true,  label: 'Today',    iconActive: 'checkmark-circle', iconInactive: 'checkmark-circle-outline' },
  { path: '/progress', exact: false, label: 'Progress', iconActive: 'bar-chart',        iconInactive: 'bar-chart-outline' },
  { path: '/profile',  exact: false, label: 'Profile',  iconActive: 'person-circle',    iconInactive: 'person-circle-outline' },
  { path: '/settings', exact: false, label: 'Settings', iconActive: 'settings',         iconInactive: 'settings-outline' },
];

/**
 * TabBarComponent — port of src/app/(tabs)/_layout.tsx.
 *
 * Glass tab bar fixed to the bottom of the viewport with:
 *  - `backdrop-filter: blur(20px) saturate(180%)` + 75%-alpha surface overlay
 *    + `-webkit-backdrop-filter` for Safari (matches the mobile feel).
 *  - 1-px hairline top border in `--color-tab-border`.
 *  - Height = 56 px + env(safe-area-inset-bottom).
 *  - Icons swap between filled (`active`) and outlined (`inactive`) variants.
 *  - Active tint = `--color-tint`; inactive tint = `--color-text-muted`.
 *
 * Tab labels: 11/500/0.1 letter-spacing.
 */
@Component({
  selector: 'app-tab-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IoniconComponent],
  template: `
    <nav class="tab-bar" role="navigation" aria-label="Primary">
      @for (tab of tabs; track tab.path) {
        <a
          class="tab"
          [routerLink]="tab.path"
          routerLinkActive="active"
          #rla="routerLinkActive"
          [routerLinkActiveOptions]="{ exact: tab.exact }"
          [attr.aria-current]="rla.isActive ? 'page' : null"
        >
          <app-ionicon
            [name]="rla.isActive ? tab.iconActive : tab.iconInactive"
            [size]="22"
            [color]="rla.isActive ? 'var(--color-tint)' : 'var(--color-text-muted)'"
          />
          <span class="label" [style.color]="rla.isActive ? 'var(--color-tint)' : 'var(--color-text-muted)'">
            {{ tab.label }}
          </span>
        </a>
      }
    </nav>
  `,
  styleUrl: './tab-bar.component.scss',
})
export class TabBarComponent {
  readonly tabs = TABS;
}
