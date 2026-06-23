import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isDoneToday, useHabitsStore } from '@/contexts/HabitsContext';
import { useColors } from '@/contexts/ThemeContext';
import type { Habit } from '@/lib/habits/types';
import { toDateKey } from '@/lib/habits/streak';
import type { Colors } from '@/lib/ui/theme';

// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Single-pass builder that returns both maps at once.
 *   countMap : dateKey → number of habits completed that day (for heat colour)
 *   habitMap : dateKey → Habit[]  (for the day-detail sheet)
 *
 * Uses the real completions[] array from each habit — no more inference from
 * streak + lastCompletedISO.
 */
function buildCompletionData(habits: Habit[]): {
  countMap: Map<string, number>;
  habitMap: Map<string, Habit[]>;
} {
  const countMap = new Map<string, number>();
  const habitMap = new Map<string, Habit[]>();

  for (const habit of habits) {
    for (const dateKey of (habit.completions ?? [])) {
      countMap.set(dateKey, (countMap.get(dateKey) ?? 0) + 1);
      const bucket = habitMap.get(dateKey);
      if (bucket) bucket.push(habit);
      else habitMap.set(dateKey, [habit]);
    }
  }
  return { countMap, habitMap };
}

/** Habits that existed (were created) on or before a given dateKey. */
function activeHabitsOnDate(habits: Habit[], dateKey: string): Habit[] {
  return habits.filter(h => toDateKey(new Date(h.createdAt)) <= dateKey);
}

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function formatDayTitle(dateKey: string): { date: string; weekday: string } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    date: `${MONTH_NAMES[m - 1]} ${d}, ${y}`,
    weekday: DAY_NAMES[dt.getDay()],
  };
}

/**
 * Returns a heat colour derived from the brand orange (#FF8B1F).
 * Five levels from barely-there cream → full deep orange.
 */
function heatColor(completed: number, total: number, emptyColor = '#F4F4F5'): string {
  if (total === 0 || completed === 0) return emptyColor;
  const ratio = completed / total;
  if (ratio < 0.25) return '#FFE4BB'; // whisper orange
  if (ratio < 0.50) return '#FFC87A'; // light amber
  if (ratio < 0.75) return '#FFA030'; // warm orange
  if (ratio < 1.00) return '#FF8B1F'; // brand orange
  return '#C85000';                   // deep burnt orange – 100%
}

/** How many days since the earliest habit was created. */
function daysSinceEarliest(habits: Habit[]): number {
  if (habits.length === 0) return 0;
  const earliest = habits.reduce((min, h) =>
    new Date(h.createdAt) < new Date(min.createdAt) ? h : min,
  );
  const diff = Date.now() - new Date(earliest.createdAt).getTime();
  return Math.max(1, Math.ceil(diff / 86_400_000));
}

// ── Day detail bottom sheet ───────────────────────────────────────────────────

function DayDetailSheet({
  dateKey,
  habits,
  habitMap,
  onClose,
}: {
  dateKey: string | null;
  habits: Habit[];
  habitMap: Map<string, Habit[]>;
  onClose: () => void;
}) {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);

  if (!dateKey) return null;

  const todayKey   = toDateKey(new Date());
  const isFuture   = dateKey > todayKey;
  const { date, weekday } = formatDayTitle(dateKey);

  const active       = activeHabitsOnDate(habits, dateKey);
  const completedSet = new Set((habitMap.get(dateKey) ?? []).map(h => h.id));
  const done         = active.filter(h => completedSet.has(h.id));
  const missed       = active.filter(h => !completedSet.has(h.id));
  const ratio        = active.length > 0 ? done.length / active.length : 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* Dimmed overlay — tap to dismiss */}
      <TouchableOpacity
        style={s.sheetOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Inner touchable blocks tap from bubbling to overlay */}
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={[s.sheet, { backgroundColor: C.surface }]}>

            {/* Header */}
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <View>
                <Text style={[s.sheetDate, { color: C.text }]}>{date}</Text>
                <Text style={[s.sheetWeekday, { color: C.textMuted }]}>{weekday}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Body */}
            {isFuture ? (
              <View style={s.sheetEmpty}>
                <Ionicons name="calendar-outline" size={32} color={C.textMuted} />
                <Text style={[s.sheetEmptyText, { color: C.textMuted }]}>This day hasn't happened yet</Text>
              </View>
            ) : active.length === 0 ? (
              <View style={s.sheetEmpty}>
                <Ionicons name="hourglass-outline" size={32} color={C.textMuted} />
                <Text style={[s.sheetEmptyText, { color: C.textMuted }]}>No habits were tracked yet</Text>
              </View>
            ) : (
              <>
                {/* Progress bar + ratio */}
                <View style={s.sheetProgressRow}>
                  <View style={[s.sheetTrack, { backgroundColor: C.border }]}>
                    <View style={[
                      s.sheetFill,
                      {
                        width: `${Math.round(ratio * 100)}%`,
                        backgroundColor: ratio === 1 ? C.done : C.tint,
                      },
                    ]} />
                  </View>
                  <Text style={[s.sheetRatioText, { color: C.textSecondary }]}>
                    {done.length} / {active.length}
                  </Text>
                </View>

                {/* Completed habits */}
                {done.map((h, i) => (
                  <View
                    key={h.id}
                    style={[
                      s.sheetHabitRow,
                      { borderTopColor: C.border },
                      i === 0 && { borderTopWidth: 1 },
                    ]}
                  >
                    <View style={[s.sheetHabitIcon, { backgroundColor: h.color }]}>
                      <Ionicons name={h.icon as never} size={15} color="#fff" />
                    </View>
                    <Text style={[s.sheetHabitName, { color: C.text }]}>{h.name}</Text>
                    <Ionicons name="checkmark-circle" size={20} color={C.done} />
                  </View>
                ))}

                {/* Missed habits */}
                {missed.map(h => (
                  <View
                    key={h.id}
                    style={[s.sheetHabitRow, { borderTopWidth: 1, borderTopColor: C.border }]}
                  >
                    <View style={[s.sheetHabitIcon, { backgroundColor: C.surfaceAlt }]}>
                      <Ionicons name={h.icon as never} size={15} color={C.textMuted} />
                    </View>
                    <Text style={[s.sheetHabitName, { color: C.textMuted }]}>{h.name}</Text>
                    <Ionicons name="remove-circle-outline" size={20} color={C.border} />
                  </View>
                ))}
              </>
            )}

            <View style={s.sheetBottom} />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Month heatmap ─────────────────────────────────────────────────────────────

function MonthHeatmap({
  completionMap,
  totalHabits,
  habits,
  onDayPress,
}: {
  completionMap: Map<string, number>;
  totalHabits: number;
  habits: Habit[];
  onDayPress: (dateKey: string) => void;
}) {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const earliestCreated = habits.length
    ? habits.reduce((min, h) =>
        new Date(h.createdAt) < new Date(min.createdAt) ? h : min,
      )
    : null;
  const createdAt = earliestCreated ? new Date(earliestCreated.createdAt) : now;
  const todayKey = toDateKey(now);

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const isEarliestMonth =
    viewYear === createdAt.getFullYear() && viewMonth === createdAt.getMonth();

  function navPrev() {
    if (isEarliestMonth) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function navNext() {
    if (isCurrentMonth) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const firstDOW = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDOW).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );

  return (
    <View style={s.heatCard}>
      {/* Month nav */}
      <View style={s.heatHeader}>
        <TouchableOpacity onPress={navPrev} disabled={isEarliestMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={16} color={isEarliestMonth ? C.border : C.textSecondary} />
        </TouchableOpacity>
        <Text style={s.heatTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={navNext} disabled={isCurrentMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={16} color={isCurrentMonth ? C.border : C.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* DOW labels */}
      <View style={s.calRow}>
        {DOW.map((d, i) => <Text key={i} style={s.dowLabel}>{d}</Text>)}
      </View>

      {/* Grid */}
      {weeks.map((week, wi) => (
        <View key={wi} style={s.calRow}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={s.calCell} />;
            const mm = String(viewMonth + 1).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            const key = `${viewYear}-${mm}-${dd}`;
            const count = completionMap.get(key) ?? 0;
            const bgColor = heatColor(count, totalHabits, C.surfaceAlt);
            const isToday = key === todayKey;

            return (
              <TouchableOpacity
                key={di}
                style={s.calCell}
                onPress={() => onDayPress(key)}
                activeOpacity={0.65}
              >
                <View style={[
                  s.heatCell,
                  { backgroundColor: bgColor },
                  isToday && s.heatCellToday,
                ]}>
                  <Text style={[
                    s.heatDayNum,
                    count > 0 && { color: count / totalHabits >= 0.5 ? '#fff' : '#92400E' },
                    isToday && count === 0 && { color: C.tint, fontWeight: '700' },
                  ]}>
                    {day}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Legend */}
      <View style={s.legendRow}>
        <Text style={s.legendLabel}>Less</Text>
        {[0, 0.2, 0.5, 0.75, 1].map((ratio, i) => (
          <View key={i} style={[s.legendChip, { backgroundColor: heatColor(ratio * totalHabits, totalHabits) }]} />
        ))}
        <Text style={s.legendLabel}>More</Text>
      </View>
    </View>
  );
}

// ── Per-habit streak row ───────────────────────────────────────────────────────

function HabitStreakRow({ habit }: { habit: Habit }) {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const progressRatio = habit.bestStreak > 0 ? Math.min(1, habit.streak / habit.bestStreak) : 0;
  const done = isDoneToday(habit);

  return (
    <TouchableOpacity
      style={s.habitRow}
      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
      activeOpacity={0.75}
    >
      <View style={[s.habitIcon, { backgroundColor: habit.color }]}>
        <Ionicons name={habit.icon as never} size={18} color="#fff" />
      </View>

      <View style={s.habitInfo}>
        <View style={s.habitTopRow}>
          <Text style={s.habitName}>{habit.name}</Text>
          <View style={s.streakBadge}>
            <Ionicons name="flame" size={13} color={C.streak} />
            <Text style={s.streakNum}>{habit.streak}</Text>
            {done && <Ionicons name="checkmark-circle" size={13} color={C.done} />}
          </View>
        </View>

        {/* Progress bar: current streak vs best */}
        <View style={s.progressTrack}>
          <View
            style={[
              s.progressFill,
              { width: `${Math.round(progressRatio * 100)}%`, backgroundColor: habit.color },
            ]}
          />
        </View>
        <Text style={s.bestLabel}>
          Best: {habit.bestStreak} {habit.bestStreak === 1 ? 'day' : 'days'}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={14} color={C.border} />
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StreaksScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { habits, loading } = useHabitsStore();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const totalHabits = habits.length;
  const overallBest = habits.reduce((m, h) => Math.max(m, h.bestStreak), 0);
  const doneToday = habits.filter(isDoneToday).length;
  const days = daysSinceEarliest(habits);
  const { countMap: completionMap, habitMap } = useMemo(
    () => buildCompletionData(habits),
    [habits],
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.heading}>Progress</Text>

        {/* ── Summary cards ── */}
        {totalHabits > 0 && (
          <View style={s.summaryRow}>
            <View style={s.summaryCard}>
              <Text style={s.summaryValue}>{totalHabits}</Text>
              <Text style={s.summaryLabel}>Habits</Text>
            </View>
            <View style={[s.summaryCard, s.summaryCardMid]}>
              <Text style={s.summaryValue}>{overallBest}</Text>
              <Text style={s.summaryLabel}>Best Streak</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={s.summaryValue}>{doneToday}/{totalHabits}</Text>
              <Text style={s.summaryLabel}>Done Today</Text>
            </View>
          </View>
        )}

        {/* ── Heatmap ── */}
        {loading || totalHabits === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="stats-chart-outline" size={36} color={C.textMuted} />
            <Text style={s.emptyTitle}>No habits yet</Text>
            <Text style={s.emptyBody}>Create habits to see your streak calendar here.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/new')} activeOpacity={0.8}>
              <Text style={s.emptyBtnText}>Create first habit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>Monthly Overview</Text>
            <MonthHeatmap
              completionMap={completionMap}
              totalHabits={totalHabits}
              habits={habits}
              onDayPress={setSelectedDay}
            />

            {/* ── Per-habit list ── */}
            <Text style={s.sectionLabel}>All Habits</Text>
            <View style={s.habitList}>
              {habits.map(h => <HabitStreakRow key={h.id} habit={h} />)}
            </View>

            <Text style={s.footerNote}>
              Tracking {days} {days === 1 ? 'day' : 'days'} · {habits.reduce((t, h) => t + h.streak, 0)} total streak days
            </Text>
          </>
        )}
      </ScrollView>

      <DayDetailSheet
        dateKey={selectedDay}
        habits={habits}
        habitMap={habitMap}
        onClose={() => setSelectedDay(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(C: Colors) { return StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 8, gap: 12, paddingBottom: 48 },
  heading: { fontSize: 30, fontWeight: '700', color: C.text, letterSpacing: -0.5, paddingTop: 8, marginBottom: 4 },

  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 4,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  summaryCardMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border },
  summaryValue: { fontSize: 24, fontWeight: '700', color: C.text },
  summaryLabel: { fontSize: 11, color: C.textMuted, marginTop: 3 },

  // Heatmap card
  heatCard: {
    backgroundColor: C.surface,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
    padding: 16, gap: 2,
  },
  heatHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  heatTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  calRow: { flexDirection: 'row' },
  dowLabel: {
    flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600',
    color: C.textMuted, paddingVertical: 5,
  },
  calCell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  heatCell: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  heatCellToday: { borderWidth: 2, borderColor: C.tint },
  heatDayNum: { fontSize: 12, color: C.textMuted, fontWeight: '400' },

  // Legend
  legendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, marginTop: 12,
  },
  legendLabel: { fontSize: 11, color: C.textMuted, marginHorizontal: 2 },
  legendChip: { width: 16, height: 16, borderRadius: 4 },

  // Habit list
  habitList: {
    backgroundColor: C.surface,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  habitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  habitIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  habitInfo: { flex: 1, gap: 6 },
  habitTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  habitName: { fontSize: 15, fontWeight: '600', color: C.text },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakNum: { fontSize: 13, fontWeight: '600', color: C.streak },
  progressTrack: {
    height: 4, borderRadius: 2, backgroundColor: C.border, overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2 },
  bestLabel: { fontSize: 11, color: C.textMuted },

  // Empty state
  emptyCard: {
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', padding: 40, gap: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.text },
  emptyBody: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
  emptyBtn: {
    backgroundColor: C.tint, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 11, marginTop: 4,
  },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  footerNote: { fontSize: 12, color: C.textMuted, textAlign: 'center', marginTop: 4 },

  // ── Day detail sheet ──────────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: '#00000075',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  sheetDate:    { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  sheetWeekday: { fontSize: 13, marginTop: 2 },

  sheetProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  sheetTrack: {
    flex: 1, height: 6, borderRadius: 3, overflow: 'hidden',
  },
  sheetFill: { height: 6, borderRadius: 3 },
  sheetRatioText: { fontSize: 13, fontWeight: '600', minWidth: 36, textAlign: 'right' },

  sheetHabitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  sheetHabitIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetHabitName: { flex: 1, fontSize: 15, fontWeight: '500' },

  sheetEmpty: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  sheetEmptyText: { fontSize: 14 },
  sheetBottom:    { height: 32 },
}); }
