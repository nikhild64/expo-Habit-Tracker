import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';

import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

const APP_VERSION = '1.0.0';

const FEATURES: { icon: string; text: string }[] = [
  { icon: 'checkmark-circle-outline', text: 'Build daily and weekly habits' },
  { icon: 'flame-outline',            text: 'Track streaks and stay motivated' },
  { icon: 'notifications-outline',    text: 'Local reminders via Web Push' },
  { icon: 'cloud-outline',            text: 'Push nudges from the server when streaks are at risk' },
  { icon: 'moon-outline',             text: 'Quiet hours — silence reminders while you sleep' },
  { icon: 'sunny-outline',            text: 'Light and dark theme' },
];

/**
 * AboutScreen — port of src/app/about.tsx.
 *
 * Static page describing the app. Reads `APP_VERSION` from a constant so we
 * never have to update environments.ts for a bump. The "Built with" copy is
 * adapted to mention Angular 21 + Web Push instead of Expo + FCM/APNs.
 */
@Component({
  selector: 'app-about-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IoniconComponent],
  templateUrl: './about.page.html',
  styleUrl: './about.page.scss',
})
export default class AboutPage {
  private readonly router = inject(Router);

  readonly version = APP_VERSION;
  readonly currentYear = new Date().getFullYear();
  readonly features = FEATURES;

  back(): void {
    if (history.length > 1) history.back();
    else void this.router.navigate(['/']);
  }

  goPrivacy(): void {
    void this.router.navigate(['/privacy']);
  }
}
