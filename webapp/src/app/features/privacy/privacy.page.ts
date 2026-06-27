import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';

import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

const LAST_UPDATED = 'June 27, 2026';

type Section = { title: string; body: string };

const SECTIONS: Section[] = [
  {
    title: '1. Information We Collect',
    body:
      'Habitly stores your habit data (names, icons, reminder times, completion history, and streaks) ' +
      'locally on your device using IndexedDB. This data never leaves your device unless you explicitly ' +
      'use a backup feature.\n\n' +
      "When push notifications are enabled, your browser's Web Push subscription is registered with our " +
      'notification server so we can send you streak nudges and reminders. The subscription is a randomly ' +
      'generated identifier and does not contain any personally identifiable information.',
  },
  {
    title: '2. How We Use Your Information',
    body:
      'Your habit data is used solely to display your habits, track streaks, and schedule local ' +
      'reminders on your device.\n\n' +
      'Your Web Push subscription is used only to deliver notifications you have opted in to receive ' +
      '(such as streak nudges). We do not share your subscription with any advertising networks or ' +
      'third-party analytics services.',
  },
  {
    title: '3. Third-Party Services',
    body:
      'Habitly uses Web Push via VAPID and the browser\'s push service (Apple Push Service for iOS ' +
      "Safari, Mozilla autopush for Firefox, FCM for Chrome). Only the encrypted push subscription " +
      'and the notification payload (title, body, habit identifier) are transmitted. No personal data ' +
      'such as your name, email, or location is transmitted.',
  },
  {
    title: '4. Data Storage & Security',
    body:
      "All habit data is stored locally on your device and is subject to your browser's built-in " +
      'security (origin isolation, encryption at rest where supported). Web Push subscriptions are ' +
      'stored on our notification server hosted on a cloud provider and are protected by API key ' +
      'authentication.\n\n' +
      'We retain subscriptions only as long as your app is installed and active. Subscriptions are ' +
      'automatically removed from our server when the browser reports them as no longer valid ' +
      '(HTTP 404 or 410 from the push service).',
  },
  {
    title: '5. Your Rights & Data Deletion',
    body:
      'You can delete all locally stored habit data at any time using the Reset App option in ' +
      'Settings → Danger Zone. This permanently erases all habits, streaks, and settings from ' +
      'your device.\n\n' +
      'Uninstalling the PWA from your home screen (or clearing site data in your browser) removes ' +
      'all locally stored data. Your Web Push subscription will be automatically cleaned up from ' +
      'our server the next time a send attempt is made.',
  },
  {
    title: "6. Children's Privacy",
    body:
      'Habitly is not directed at children under the age of 13. We do not knowingly collect ' +
      'personal information from children. If you believe a child has used the app and you have ' +
      'concerns, please contact us.',
  },
  {
    title: '7. Changes to This Policy',
    body:
      'We may update this Privacy Policy from time to time. Any changes will be reflected with an ' +
      'updated "Last updated" date at the top of this page. Continued use of the app after changes ' +
      'are posted constitutes your acceptance of the revised policy.',
  },
  {
    title: '8. Contact',
    body:
      'If you have any questions or concerns about this Privacy Policy, please contact us at:\n\n' +
      'nikhildhawan.dev@gmail.com',
  },
];

/**
 * PrivacyScreen — port of src/app/privacy.tsx.
 *
 * Static legal page. Sections 1, 2, 3, 4, 5 are adapted from the mobile
 * version to mention IndexedDB / Web Push / VAPID instead of AsyncStorage,
 * Expo Push, and FCM/APNs. `LAST_UPDATED` bumped to today.
 */
@Component({
  selector: 'app-privacy-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IoniconComponent],
  templateUrl: './privacy.page.html',
  styleUrl: './privacy.page.scss',
})
export default class PrivacyPage {
  private readonly router = inject(Router);

  readonly lastUpdated = LAST_UPDATED;
  readonly sections = SECTIONS;
  readonly currentYear = new Date().getFullYear();

  back(): void {
    if (history.length > 1) history.back();
    else void this.router.navigate(['/']);
  }
}
