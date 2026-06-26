'use no memo';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { Habit } from '@/lib/habits/types';

export type WidgetHabit = {
  id: string;
  name: string;
  color: string;
  /** Whether the habit is already done today. */
  done: boolean;
  /** Current streak length. */
  streak: number;
};

/** Max habit rows we render — extras are clipped naturally if the widget is small. */
const MAX_HABITS = 6;

export function snapshotForWidget(
  habits: Habit[],
  isDoneToday: (h: Habit) => boolean,
): { date: string; habits: WidgetHabit[] } {
  // Short date format ("Wed, Jun 26") to stay readable in narrow widget sizes.
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const active = habits.filter(h => (h.status ?? 'active') === 'active');
  const sorted = [...active].sort((a, b) => {
    const aDone = isDoneToday(a) ? 1 : 0;
    const bDone = isDoneToday(b) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone; // undone first
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
  return {
    date,
    habits: sorted.slice(0, MAX_HABITS).map(h => ({
      id: h.id,
      name: h.name,
      color: h.color,
      done: isDoneToday(h),
      streak: h.streak,
    })),
  };
}

/**
 * Today widget — shows date + up to 6 habits in a compact layout.
 *
 * Sized for a 3x2 grid cell default (~220x200dp) but resizes between
 * `minResizeWidth/Height` and `maxResizeWidth/Height` from the app.json config.
 * At smaller sizes, extra rows are clipped naturally — the header + counter
 * stay visible. Tapping anywhere opens the app.
 *
 * NOTE: This component must use ONLY widget primitives. No hooks. No standard
 * React Native components. Function must be pure.
 */
export function HabitlyTodayWidget(props: { date?: string; habits?: WidgetHabit[] }) {
  const habits = props.habits ?? [];
  const date = props.date ?? '';
  const doneCount = habits.filter(h => h.done).length;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#1B1B23',
        borderRadius: 16,
        padding: 10,
        flexDirection: 'column',
      }}
    >
      {/* Header row: brand + counter together so header stays one line */}
      <FlexWidget
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: 'match_parent' }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget
            text="Habitly"
            style={{ fontSize: 13, fontWeight: '700', color: '#FF8B1F', letterSpacing: 0.3 }}
          />
          <TextWidget
            text={`  ${date}`}
            style={{ fontSize: 10, color: '#8080A4' }}
          />
        </FlexWidget>
        <TextWidget
          text={`${doneCount}/${habits.length}`}
          style={{ fontSize: 12, fontWeight: '700', color: '#B4B4CC' }}
        />
      </FlexWidget>

      {/* Thin divider */}
      <FlexWidget
        style={{ height: 1, width: 'match_parent', backgroundColor: '#38384E', marginTop: 6, marginBottom: 4 }}
      />

      {habits.length === 0 ? (
        <FlexWidget
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            width: 'match_parent',
          }}
        >
          <TextWidget
            text="Add habits in the app"
            style={{ fontSize: 11, color: '#8080A4' }}
          />
        </FlexWidget>
      ) : (
        habits.map(habit => (
          <FlexWidget
            key={habit.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              width: 'match_parent',
              paddingVertical: 3,
            }}
          >
            <FlexWidget
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: (habit.done ? '#34D399' : habit.color) as `#${string}`,
                marginRight: 8,
              }}
            />
            <FlexWidget style={{ flex: 1 }}>
              <TextWidget
                text={habit.name}
                maxLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: habit.done ? '#8080A4' : '#F4F4FE',
                }}
              />
            </FlexWidget>
            {habit.done ? (
              <TextWidget text="✓" style={{ fontSize: 14, fontWeight: '800', color: '#34D399' }} />
            ) : habit.streak > 0 ? (
              <TextWidget
                text={`${habit.streak}d`}
                style={{ fontSize: 10, fontWeight: '700', color: '#FB923C' }}
              />
            ) : (
              <FlexWidget style={{ width: 1, height: 1 }} />
            )}
          </FlexWidget>
        ))
      )}
    </FlexWidget>
  );
}
