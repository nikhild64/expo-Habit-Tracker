import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';

import { IoniconComponent } from '../ionicon/ionicon.component';

/**
 * Soft contract for the `beforeinstallprompt` event — exposed as a separate
 * type because TypeScript's `lib.dom.d.ts` doesn't yet ship it.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'install-prompt-dismissed';

/**
 * InstallPromptComponent — dismissible banner that surfaces the PWA
 * install affordance:
 *
 *  - Android / desktop Chromium: captures `beforeinstallprompt`, swallows
 *    the default mini-infobar, and shows an `Install Habitly` CTA that
 *    calls `prompt()` from inside the user click handler.
 *  - iOS Safari (no `beforeinstallprompt`): shows a one-time guided
 *    banner explaining the Share → Add to Home Screen path. iOS PWAs
 *    cannot be installed programmatically.
 *
 * Hidden forever once:
 *  - The app is already running in standalone mode (display-mode standalone
 *    OR `navigator.standalone === true` on iOS), OR
 *  - The user dismisses the banner (persisted to localStorage under
 *    `install-prompt-dismissed`).
 *
 * Mounted globally in the root `App` template so it floats above every
 * route. It self-anchors to the bottom of the viewport above the tab bar
 * via `position: fixed`.
 */
@Component({
  selector: 'app-install-prompt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  templateUrl: './install-prompt.component.html',
  styleUrl: './install-prompt.component.scss',
})
export class InstallPromptComponent implements OnInit, OnDestroy {
  protected readonly visible = signal(false);
  protected readonly isIos = signal(false);
  protected readonly isStandalone = signal(false);
  /** True only on Android/desktop after the browser fires beforeinstallprompt. */
  protected readonly canInstall = signal(false);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private readonly bipHandler = (e: Event) => this.onBeforeInstallPrompt(e);
  private readonly installedHandler = () => this.onAppInstalled();

  ngOnInit(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const ua = navigator.userAgent;
    // Guard against test environments (jsdom) that don't implement matchMedia.
    const standalone =
      (typeof window.matchMedia === 'function'
        && window.matchMedia('(display-mode: standalone)').matches)
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;

    this.isStandalone.set(standalone);
    this.isIos.set(/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream);

    if (standalone) return;
    if (this.dismissed()) return;

    window.addEventListener('beforeinstallprompt', this.bipHandler);
    window.addEventListener('appinstalled', this.installedHandler);

    // iOS Safari (or another browser without beforeinstallprompt) gets the
    // guidance card immediately because there's no programmatic prompt.
    if (this.isIos()) {
      this.visible.set(true);
    }
  }

  ngOnDestroy(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('beforeinstallprompt', this.bipHandler);
    window.removeEventListener('appinstalled', this.installedHandler);
  }

  @HostListener('window:appinstalled')
  protected onAppInstalled(): void {
    this.isStandalone.set(true);
    this.visible.set(false);
  }

  protected onBeforeInstallPrompt(e: Event): void {
    e.preventDefault();
    this.deferredPrompt = e as BeforeInstallPromptEvent;
    this.canInstall.set(true);
    this.visible.set(true);
  }

  protected async install(): Promise<void> {
    const evt = this.deferredPrompt;
    if (!evt) return;
    this.deferredPrompt = null;
    try {
      const { outcome } = await evt.prompt();
      if (outcome === 'accepted') {
        this.visible.set(false);
      }
    } catch {
      this.visible.set(false);
    }
  }

  protected dismiss(): void {
    this.visible.set(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private-mode quota; the banner just reappears on next boot.
    }
  }

  private dismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }
}
