import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { GamificationService } from '../../core/services/gamification.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { ACCENT_PRESETS, type AccentId, type AccentPreset } from '../../core/models/theme';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { ConfirmationComponent } from '../../shared/components/confirmation/confirmation.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

const ACCENT_COST = 100;

/**
 * ShopScreen — port of src/app/shop.tsx.
 *
 * Full-screen cosmetics store. Header (close left, "Cosmetics" centre, amber
 * coin pill right) + hero card + grid of 8 accent cards (3 free, 5 at 100
 * coins each).
 *
 * Buy flow:
 *   - coins < 100 → toast.info("Need N more coins to unlock {label}")
 *   - else → ConfirmationComponent → spendCoins(100) + unlockAccent(id) +
 *            setAccent(id) + toast.success("{label} unlocked!")
 *
 * After unlocking, the card immediately switches to the "Active" button.
 */
@Component({
  selector: 'app-shop-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    CardComponent,
    ButtonComponent,
    ConfirmationComponent,
    IoniconComponent,
  ],
  templateUrl: './shop.page.html',
  styleUrl: './shop.page.scss',
})
export default class ShopPage {
  private readonly gamification = inject(GamificationService);
  private readonly themeService = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly accents = ACCENT_PRESETS;
  readonly coins = this.gamification.coins;
  readonly activeAccent = this.themeService.accent;
  readonly unlockedAccents = this.themeService.unlockedAccents;

  readonly pending = signal<AccentPreset | null>(null);
  readonly confirmMessage = computed(() =>
    `Spend ${ACCENT_COST} coins to permanently unlock this accent color.`,
  );

  back(): void {
    if (history.length > 1) history.back();
    else void this.router.navigate(['/']);
  }

  isUnlocked(id: AccentId): boolean {
    return this.unlockedAccents().includes(id);
  }

  isActive(id: AccentId): boolean {
    return this.activeAccent() === id;
  }

  apply(id: AccentId): void {
    this.themeService.setAccent(id);
  }

  startBuy(preset: AccentPreset): void {
    if (this.isUnlocked(preset.id)) return;
    const have = this.coins();
    if (have < ACCENT_COST) {
      this.toast.info(`Need ${ACCENT_COST - have} more coins to unlock ${preset.label}`);
      return;
    }
    this.pending.set(preset);
  }

  async confirmBuy(): Promise<void> {
    const preset = this.pending();
    if (!preset) return;
    const ok = await this.gamification.spendCoins(ACCENT_COST);
    if (!ok) {
      this.toast.error('Not enough coins — try again after earning more');
      this.pending.set(null);
      return;
    }
    await this.themeService.unlockAccent(preset.id);
    this.themeService.setAccent(preset.id);
    this.toast.success(`${preset.label} unlocked!`);
    this.pending.set(null);
  }

  cancelBuy(): void {
    this.pending.set(null);
  }
}
