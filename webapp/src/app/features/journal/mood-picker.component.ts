import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

import { MOOD_EMOJI, type MoodScore } from '../../core/models/mood';

const SCORES: MoodScore[] = [1, 2, 3, 4, 5];

/**
 * MoodPicker — internal sub-component for /journal/:date.
 *
 * 5-cell horizontal selector (😞 😕 😐 🙂 😄). Tapping the currently-active
 * cell clears the value (returns `undefined`).
 *
 * Labels are passed in (`MOOD_LABEL` for mood, `ENERGY_LABEL` for energy)
 * so the same picker doubles for both fields.
 */
@Component({
  selector: 'app-mood-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <p class="picker-label">{{ label() }}</p>
      <div class="row" role="radiogroup" [attr.aria-label]="label()">
        @for (score of scores; track score) {
          @let active = value() === score;
          <button
            type="button"
            class="cell"
            [class.active]="active"
            role="radio"
            [attr.aria-checked]="active"
            (click)="pick(score)"
          >
            <span class="emoji">{{ emoji[score] }}</span>
            <span class="cell-label">{{ labels()[score] }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .wrap {
      margin-top: 6px;
    }
    .picker-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text);
      margin: 0 0 8px;
    }
    .row {
      display: flex;
      gap: 6px;
    }
    .cell {
      flex: 1;
      border-radius: 12px;
      border: 1.5px solid transparent;
      background-color: var(--color-surface-alt);
      padding: 8px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      cursor: pointer;
      font-family: inherit;
      color: var(--color-text-muted);
      font-weight: 600;
    }
    .cell.active {
      background-color: var(--color-tint);
      border-color: var(--color-tint);
      color: #fff;
      font-weight: 700;
    }
    .emoji {
      font-size: 22px;
      line-height: 1.2;
    }
    .cell-label {
      font-size: 10px;
    }
  `],
})
export class MoodPickerComponent {
  readonly label  = input.required<string>();
  readonly labels = input.required<Record<MoodScore, string>>();
  readonly value  = input<MoodScore | undefined>(undefined);

  readonly changed = output<MoodScore | undefined>();

  readonly scores = SCORES;
  readonly emoji  = MOOD_EMOJI;

  pick(score: MoodScore): void {
    this.changed.emit(this.value() === score ? undefined : score);
  }
}
