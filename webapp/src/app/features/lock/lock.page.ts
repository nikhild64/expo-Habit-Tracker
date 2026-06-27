import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { HapticsService } from '../../core/services/haptics.service';
import { LockService } from '../../core/services/lock.service';
import { ToastService } from '../../core/services/toast.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { ConfirmationComponent } from '../../shared/components/confirmation/confirmation.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

type Mode = 'setup' | 'confirm' | 'verify';
type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'bio' | 'back';

const KEYPAD: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['bio', '0', 'back'],
];

/**
 * LockScreen — port of src/app/lock.tsx.
 *
 * Three modes:
 *   - setup:   "Set a 4-digit PIN" → after 4 digits move to confirm
 *   - confirm: "Confirm your PIN"  → match? store + register passkey
 *                                    if biometric requested. Mismatch? back
 *                                    to setup with error haptic.
 *   - verify:  "Unlock Habitly"    → either PIN or biometric passkey.
 *
 * Routes here through `/lock?setup=1` when the user toggles "App Lock" on
 * from Settings; otherwise (LockGuard redirect) we land in `verify`.
 */
@Component({
  selector: 'app-lock-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ButtonComponent,
    ConfirmationComponent,
    IoniconComponent,
  ],
  templateUrl: './lock.page.html',
  styleUrl: './lock.page.scss',
})
export default class LockPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly lockService = inject(LockService);
  private readonly toast = inject(ToastService);
  private readonly haptics = inject(HapticsService);

  /** True when this page was opened from Settings → "Set up app lock". */
  readonly isSetupFlow = signal(this.route.snapshot.queryParamMap.get('setup') === '1');

  readonly prefs = this.lockService.prefs;
  readonly webauthnSupported = this.lockService.webauthnSupported;

  readonly mode = signal<Mode>(
    this.isSetupFlow() ? (this.prefs().enabled ? 'verify' : 'setup') : 'verify',
  );
  readonly pin = signal('');
  readonly firstPin = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly disableConfirm = signal(false);

  readonly title = computed(() => {
    switch (this.mode()) {
      case 'setup':   return 'Set a 4-digit PIN';
      case 'confirm': return 'Confirm your PIN';
      default:        return 'Unlock Habitly';
    }
  });

  readonly subtitle = computed(() => {
    switch (this.mode()) {
      case 'setup':   return 'Use this PIN to unlock the app.';
      case 'confirm': return 'Re-enter the same PIN.';
      default: {
        return this.bioReady() ? 'Use biometric or enter PIN.' : 'Enter your PIN.';
      }
    }
  });

  readonly bioReady = computed(() =>
    this.webauthnSupported()
    && this.prefs().biometricEnabled
    && !!this.prefs().biometricCredentialId,
  );

  /** Render the bio key only when we're in verify, supported and registered. */
  readonly bioKeyVisible = computed(() =>
    this.webauthnSupported()
    && this.mode() === 'verify'
    && !this.isSetupFlow()
    && !!this.prefs().biometricCredentialId,
  );

  /** Whether to render the setup-flow extras (Change/Disable + bio toggle). */
  readonly setupExtras = computed(() =>
    this.isSetupFlow() && this.mode() === 'verify' && this.prefs().enabled,
  );

  /** Holds the keypad rows so the template can `@for`. */
  readonly keypad = KEYPAD;

  /** Holds the dots indices (0..3) for the dots row. */
  readonly dotIndices = [0, 1, 2, 3];

  constructor() {
    // Auto-trigger biometric on mount when verifying and biometric is on.
    if (this.mode() === 'verify' && !this.isSetupFlow() && this.bioReady()) {
      // Defer so the first paint shows the UI before the OS prompt opens.
      queueMicrotask(() => void this.runBiometric());
    }
  }

  pressKey(key: KeypadKey): void {
    if (key === 'back') return this.pressBack();
    if (key === 'bio') return void this.runBiometric();
    this.pressDigit(key);
  }

  pressDigit(d: string): void {
    if (this.pin().length >= 4) return;
    this.haptics.selection();
    const next = this.pin() + d;
    this.pin.set(next);
    this.error.set(null);
    if (next.length === 4) {
      // Mirrors the mobile 100 ms timeout so the user sees the 4th dot fill
      // before the screen transitions on a correct PIN.
      setTimeout(() => void this.handleComplete(next), 100);
    }
  }

  pressBack(): void {
    this.haptics.selection();
    this.pin.update(p => p.slice(0, -1));
  }

  async handleComplete(completed: string): Promise<void> {
    if (this.mode() === 'setup') {
      this.firstPin.set(completed);
      this.pin.set('');
      this.mode.set('confirm');
      return;
    }
    if (this.mode() === 'confirm') {
      const first = this.firstPin();
      if (first && first === completed) {
        const wantsBio = this.prefs().biometricEnabled && this.webauthnSupported();
        await this.lockService.setPin(completed, wantsBio);

        // Best-effort passkey registration — failure is non-fatal: PIN still
        // works, the user just doesn't get the biometric shortcut.
        if (wantsBio) {
          const ok = await this.lockService.registerPasskey();
          if (!ok) {
            // Silently downgrade — keep PIN-only.
            await this.lockService.updatePrefs({ biometricEnabled: false });
          }
        }

        this.haptics.success();
        this.toast.success('App lock enabled — PIN set');
        this.lockService.unlock();
        void this.router.navigate(['/']);
      } else {
        this.haptics.error();
        this.error.set("PINs don't match. Try again.");
        this.firstPin.set(null);
        this.pin.set('');
        this.mode.set('setup');
      }
      return;
    }
    // verify
    const ok = await this.lockService.verifyPin(completed);
    if (ok) {
      this.haptics.success();
      this.lockService.unlock();
      void this.router.navigate(['/']);
    } else {
      this.haptics.error();
      this.error.set('Wrong PIN. Try again.');
      this.pin.set('');
    }
  }

  async runBiometric(): Promise<void> {
    if (!this.bioReady()) return;
    const ok = await this.lockService.verifyPasskey();
    if (ok) {
      this.haptics.success();
      this.lockService.unlock();
      void this.router.navigate(['/']);
    }
    // No toast on failure — the user can fall back to PIN, no need to nag.
  }

  // ── Setup-flow extras ─────────────────────────────────────────────────

  changePin(): void {
    this.mode.set('setup');
    this.pin.set('');
    this.error.set(null);
    this.firstPin.set(null);
  }

  showDisableConfirm(): void {
    this.disableConfirm.set(true);
  }

  cancelDisable(): void {
    this.disableConfirm.set(false);
  }

  async confirmDisable(): Promise<void> {
    this.disableConfirm.set(false);
    await this.lockService.clearLock();
    if (history.length > 1) history.back();
    else void this.router.navigate(['/settings']);
  }

  toggleBio(): void {
    const next = !this.prefs().biometricEnabled;
    void this.lockService.updatePrefs({ biometricEnabled: next });

    // If we're turning bio ON and we don't yet have a credential, register
    // one immediately — the user is on the setup screen, so this is the
    // right moment to gate the OS biometric prompt.
    if (next && !this.prefs().biometricCredentialId && this.webauthnSupported()) {
      void this.lockService.registerPasskey().then(ok => {
        if (!ok) {
          void this.lockService.updatePrefs({ biometricEnabled: false });
          this.toast.info('Biometric setup was cancelled');
        } else {
          this.toast.success('Biometric enabled');
        }
      });
    }
  }
}
