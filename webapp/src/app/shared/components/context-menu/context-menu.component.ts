import { CdkTrapFocus } from '@angular/cdk/a11y';
import { UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
} from '@angular/core';

import { IoniconComponent } from '../ionicon/ionicon.component';

export type ContextMenuItem = {
  icon?: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Optional caller-defined id forwarded back via (itemPicked). */
  id?: string;
};

/**
 * ContextMenuComponent — port of src/components/ui/ContextMenu.tsx.
 *
 * Renders the centered-modal menu (NOT anchored to the press point — same
 * reasoning as the mobile, anchored menus need precise clamping and tend
 * to flicker on Android).
 *
 * Wire the long-press trigger via `LongPressDirective` on the host element,
 * then toggle `[visible]` from the parent:
 *
 *   <div appLongPress (longPress)="menuOpen.set(true)">…</div>
 *   <app-context-menu
 *     [visible]="menuOpen()"
 *     [items]="contextItems"
 *     [title]="habit.name"
 *     (closed)="menuOpen.set(false)"
 *     (itemPicked)="onMenuPick($event)"
 *   />
 */
@Component({
  selector: 'app-context-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent, CdkTrapFocus, UpperCasePipe],
  template: `
    @if (visible()) {
      <div
        class="backdrop"
        role="dialog"
        aria-modal="true"
        (click)="onClose()"
      >
        <div
          class="menu"
          role="menu"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (click)="$event.stopPropagation()"
        >
          @if (title()) {
            <div class="title">{{ title() | uppercase }}</div>
          }
          @for (item of items(); track $index) {
            <button
              type="button"
              role="menuitem"
              class="item"
              [class.destructive]="item.destructive"
              [disabled]="item.disabled"
              [attr.aria-label]="item.label"
              (click)="pick(item)"
            >
              @if (item.icon) {
                <app-ionicon
                  [name]="item.icon"
                  [size]="18"
                  [color]="item.destructive ? 'var(--color-danger)' : 'var(--color-text-secondary)'"
                />
              }
              <span class="label">{{ item.label }}</span>
            </button>
          }
        </div>
      </div>
    }
  `,
  styleUrl: './context-menu.component.scss',
})
export class ContextMenuComponent {
  readonly visible = input<boolean>(false);
  readonly items = input.required<ContextMenuItem[]>();
  readonly title = input<string | undefined>(undefined);

  readonly closed = output<void>();
  readonly itemPicked = output<ContextMenuItem>();

  onClose(): void {
    this.closed.emit();
  }

  pick(item: ContextMenuItem): void {
    if (item.disabled) return;
    this.itemPicked.emit(item);
    this.onClose();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible()) this.onClose();
  }
}
