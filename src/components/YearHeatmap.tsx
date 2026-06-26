import { Canvas, Group, Rect, RoundedRect } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';

import { useColors } from '@/contexts/ThemeContext';

type Props = {
  /** Map of YYYY-MM-DD → number of completions that day (0 = no completion). */
  completionsByDate: Map<string, number>;
  /** Max count used to scale the intensity (typically = active habit count). */
  maxCount: number;
  /** Color used for the highest intensity cells (defaults to theme tint). */
  color?: string;
  cellSize?: number;
  cellGap?: number;
};

/**
 * GitHub-style year-long heatmap, Skia-rendered for performance with ~365 cells.
 * Renders columns of 7 days (Sun..Sat) from oldest week (left) to current week (right).
 *
 * Wrapped in `React.memo` with a custom comparator: Skia Canvas mounts are
 * expensive, so we only re-render when the data map size, maxCount, or color
 * actually change (parent re-renders without data changes are no-ops).
 */
function YearHeatmapImpl({ completionsByDate, maxCount, color, cellSize = 12, cellGap = 3 }: Props) {
  const C = useColors();
  const accent = color ?? C.tint;

  const { cells, weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 364);
    // Align start to a Sunday so the grid lines up cleanly
    while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

    const days: Array<{ key: string; count: number; dow: number; month: number }> = [];
    const cur = new Date(start);
    while (cur <= today) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${d}`;
      days.push({ key, count: completionsByDate.get(key) ?? 0, dow: cur.getDay(), month: cur.getMonth() });
      cur.setDate(cur.getDate() + 1);
    }

    const numWeeks = Math.ceil(days.length / 7);
    const seenMonths: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;
    for (let i = 0; i < days.length; i++) {
      const col = Math.floor(i / 7);
      if (days[i].month !== lastMonth) {
        seenMonths.push({ col, label: MONTH_ABBR[days[i].month] });
        lastMonth = days[i].month;
      }
    }

    return { cells: days, weeks: numWeeks, monthLabels: seenMonths };
  }, [completionsByDate]);

  function intensity(count: number): number {
    if (count === 0) return 0;
    if (maxCount === 0) return 0;
    return Math.min(1, count / maxCount);
  }

  function cellColor(count: number): string {
    const i = intensity(count);
    if (i === 0) return C.surfaceAlt;
    if (i < 0.25) return accent + '40';
    if (i < 0.50) return accent + '80';
    if (i < 0.75) return accent + 'BB';
    return accent;
  }

  const W = weeks * (cellSize + cellGap);
  const H = 7 * (cellSize + cellGap) + 20;

  return (
    <View>
      <Canvas style={{ width: W, height: H }}>
        <Group transform={[{ translateY: 14 }]}>
          {cells.map((day, i) => {
            const col = Math.floor(i / 7);
            const row = day.dow;
            const x = col * (cellSize + cellGap);
            const y = row * (cellSize + cellGap);
            return (
              <RoundedRect
                key={day.key}
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                r={2.5}
                color={cellColor(day.count)}
              />
            );
          })}
        </Group>
        {/* Month labels along the top */}
        <Group>
          {monthLabels.map((m, i) => {
            const x = m.col * (cellSize + cellGap);
            return (
              <Rect key={`${m.label}-${i}`} x={x} y={0} width={1} height={0} color="transparent" />
            );
          })}
        </Group>
      </Canvas>
      {/* Plain RN month labels overlaid above the canvas */}
      <View style={{ flexDirection: 'row', position: 'absolute', top: 0, left: 0, right: 0 }}>
        {monthLabels.map((m, i) => (
          <Text
            key={`${m.label}-${i}`}
            style={{
              position: 'absolute',
              left: m.col * (cellSize + cellGap),
              fontSize: 9,
              color: C.textMuted,
              fontWeight: '600',
            }}
          >
            {m.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const YearHeatmap = memo(
  YearHeatmapImpl,
  (a, b) =>
    a.completionsByDate.size === b.completionsByDate.size &&
    a.maxCount === b.maxCount &&
    a.color === b.color &&
    a.cellSize === b.cellSize &&
    a.cellGap === b.cellGap,
);
