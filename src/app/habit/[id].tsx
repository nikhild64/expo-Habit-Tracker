import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColors } from '@/contexts/ThemeContext';
import { isDoneToday, useHabits } from '@/hooks/use-habits';
import type { Habit } from '@/lib/habits/types';
import type { Colors } from '@/lib/ui/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDateKey(d: Date): string {
  // Use local date parts to avoid UTC-shift on ISO string
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Infers which calendar days are part of the current streak by stepping
 * backwards from `lastCompletedISO` for `streak` consecutive days.
 * This is an estimate — the app does not store a full completion history.
 */
function getStreakDateKeys(habit: Habit): Set<string> {
  if (!habit.lastCompletedISO || habit.streak <= 0) return new Set();
  const end = new Date(habit.lastCompletedISO);
  const keys = new Set<string>();
  for (let i = 0; i < habit.streak; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    keys.add(toDateKey(d));
  }
  return keys;
}

function formatFrequencyFull(habit: Habit): string {
  const f = habit.frequency;
  const h = f.hour % 12 || 12;
  const m = f.minute.toString().padStart(2, '0');
  const period = f.hour >= 12 ? 'PM' : 'AM';
  const time = `${h}:${m} ${period}`;
  if (f.kind === 'daily') return `Every day at ${time}`;
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const days = f.weekdays.map(d => DAY_NAMES[d - 1]).join(', ');
  return `${days} at ${time}`;
}

// ── Streak Calendar ───────────────────────────────────────────────────────────

function StreakCalendar({ habit }: { habit: Habit }) {
  const C = useColors();
  const cal = useMemo(() => createCalStyles(C), [C]);
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const todayKey = toDateKey(now);
  const streakKeys = getStreakDateKeys(habit);
  const createdAt = new Date(habit.createdAt);

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const isCreatedMonth =
    viewYear === createdAt.getFullYear() && viewMonth === createdAt.getMonth();

  function navPrev() {
    if (isCreatedMonth) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function navNext() {
    if (isCurrentMonth) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  // Build flat cell array for the month
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
    <View style={cal.container}>
      {/* Month nav */}
      <View style={cal.header}>
        <TouchableOpacity onPress={navPrev} disabled={isCreatedMonth} style={cal.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={16} color={isCreatedMonth ? C.border : C.textSecondary} />
        </TouchableOpacity>
        <Text style={cal.title}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={navNext} disabled={isCurrentMonth} style={cal.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={16} color={isCurrentMonth ? C.border : C.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={cal.row}>
        {DOW_LABELS.map((d, i) => (
          <Text key={i} style={cal.dowLabel}>{d}</Text>
        ))}
      </View>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <View key={wi} style={cal.row}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={cal.cell} />;
            const mm = String(viewMonth + 1).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            const key = `${viewYear}-${mm}-${dd}`;
            const isToday = key === todayKey;
            const isStreak = streakKeys.has(key);

            return (
              <View key={di} style={cal.cell}>
                <View style={[
                  cal.dayCircle,
                  isStreak && { backgroundColor: habit.color },
                  isToday && !isStreak && cal.dayCircleToday,
                  isToday && isStreak && { borderWidth: 2.5, borderColor: '#fff' },
                ]}>
                  <Text style={[
                    cal.dayText,
                    isStreak && cal.dayTextStreak,
                    isToday && !isStreak && cal.dayTextToday,
                  ]}>
                    {day}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}

      {/* Legend */}
      <View style={cal.legend}>
        <View style={cal.legendItem}>
          <View style={[cal.legendDot, { backgroundColor: habit.color }]} />
          <Text style={cal.legendText}>Streak</Text>
        </View>
        <View style={cal.legendItem}>
          <View style={[cal.legendDot, cal.legendDotToday]} />
          <Text style={cal.legendText}>Today</Text>
        </View>
      </View>
    </View>
  );
}

// ── Stat box ──────────────────────────────────────────────────────────────────

function StatBox({ value, label, icon }: { value: string | number; label: string; icon: string }) {
  const C = useColors();
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon as never} size={18} color={C.textMuted} style={{ marginBottom: 4 }} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HabitDetailScreen() {
  const C = useColors();
  const styles = useMemo(() => createStyles(C), [C]);
  const cal = useMemo(() => createCalStyles(C), [C]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { habits, markDone, deleteHabit, loadFresh } = useHabits();

  // Reload habits when this screen regains focus (e.g. returning from the edit screen).
  // Without this, the detail view shows stale data after saving changes in new.tsx.
  useFocusEffect(useCallback(() => { loadFresh(); }, []));

  const habit = habits.find(h => h.id === id);

  function confirmDelete() {
    Alert.alert(
      'Delete habit',
      `Remove "${habit?.name}"? Your streak data will be lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteHabit(id);
            router.back();
          },
        },
      ],
    );
  }

  if (!habit) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Habit not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const done = isDoneToday(habit);
  const createdDate = new Date(habit.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/new', params: { edit: habit.id } })}
          style={styles.editBtn}
        >
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Identity ── */}
        <View style={styles.identity}>
          <View style={[styles.iconBadge, { backgroundColor: habit.color }]}>
            <Ionicons name={habit.icon as never} size={40} color="#fff" />
          </View>
          <Text style={styles.habitName}>{habit.name}</Text>
          <Text style={styles.frequency}>{formatFrequencyFull(habit)}</Text>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <StatBox value={habit.streak} label="Current streak" icon="flame" />
          <View style={styles.statDivider} />
          <StatBox value={habit.bestStreak} label="Best streak" icon="trophy-outline" />
          <View style={styles.statDivider} />
          <StatBox value={createdDate} label="Started" icon="calendar-outline" />
        </View>

        {/* ── Mark Done ── */}
        <TouchableOpacity
          style={[styles.doneBtn, done && styles.doneBtnDone]}
          onPress={() => markDone(habit.id)}
          disabled={done}
          activeOpacity={0.8}
        >
          <Ionicons
            name={done ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={22}
            color={done ? C.done : '#fff'}
          />
          <Text style={[styles.doneBtnText, done && { color: C.done }]}>
            {done ? 'Done for today' : 'Mark as done today'}
          </Text>
        </TouchableOpacity>

        {/* ── Streak callout ── */}
        {habit.streak > 1 && (
          <View style={styles.streakCallout}>
            <Ionicons name="flame" size={16} color={C.streak} />
            <Text style={styles.streakCalloutText}>
              {habit.streak}-day streak — keep it up!
            </Text>
          </View>
        )}

        {/* ── Calendar streak view ── */}
        <Text style={styles.sectionLabel}>Streak History</Text>
        <StreakCalendar habit={habit} />

        {/* ── Delete ── */}
        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={16} color={C.danger} />
          <Text style={styles.deleteText}>Delete habit</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(C: Colors) { return StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  editBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, backgroundColor: C.tintLight,
  },
  editText: { fontSize: 14, fontWeight: '600', color: C.tint },

  content: { padding: 20, gap: 16, paddingBottom: 48 },

  identity: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  iconBadge: {
    width: 88, height: 88, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  habitName: { fontSize: 26, fontWeight: '700', color: C.text, textAlign: 'center', letterSpacing: -0.3 },
  frequency: { fontSize: 14, color: C.textMuted },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 20, paddingHorizontal: 8 },
  statValue: { fontSize: 18, fontWeight: '700', color: C.text },
  statLabel: { fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: 12 },

  doneBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.tint, borderRadius: 14, paddingVertical: 16,
  },
  doneBtnDone: { backgroundColor: C.doneLight, borderWidth: 1, borderColor: C.done },
  doneBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  streakCallout: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.streakLight, borderRadius: 10, padding: 14,
  },
  streakCalloutText: { fontSize: 14, color: C.streak, fontWeight: '500' },

  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 4,
  },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    marginTop: 4,
  },
  deleteText: { fontSize: 14, fontWeight: '500', color: C.danger },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: 16, color: C.textMuted },
  backLink: { paddingVertical: 10 },
  backLinkText: { fontSize: 15, color: C.tint, fontWeight: '600' },
}); }

// ── Calendar styles ───────────────────────────────────────────────────────────

function createCalStyles(C: Colors) { return StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
    padding: 16, gap: 2,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  navBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: C.text },

  row: { flexDirection: 'row' },
  dowLabel: {
    flex: 1, textAlign: 'center',
    fontSize: 11, fontWeight: '600', color: C.textMuted,
    paddingVertical: 6,
  },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  dayCircle: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  dayCircleToday: { borderWidth: 2, borderColor: C.tint },
  dayText: { fontSize: 13, color: C.textMuted, fontWeight: '400' },
  dayTextStreak: { color: '#fff', fontWeight: '700' },
  dayTextToday: { color: C.tint, fontWeight: '700' },

  legend: {
    flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendDotToday: { borderWidth: 2, borderColor: C.tint, backgroundColor: 'transparent' },
  legendText: { fontSize: 11, color: C.textMuted },
}); }
