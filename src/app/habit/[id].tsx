import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGamification } from '@/contexts/GamificationContext';
import { isDoneToday, useHabitsStore } from '@/contexts/HabitsContext';
import { useColors } from '@/contexts/ThemeContext';
import { XP_COMPLETE_HABIT } from '@/lib/gamification/rules';
import { toDateKey } from '@/lib/habits/streak';
import { computeHabitStats } from '@/lib/habits/stats';
import { analyzeReminderEffectiveness } from '@/lib/habits/smart-reminders';
import type { Habit } from '@/lib/habits/types';
import type { Colors } from '@/lib/ui/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Returns all completion dates as a Set for O(1) calendar lookups. */
function getCompletionDateKeys(habit: Habit): Set<string> {
  return new Set(habit.completions ?? []);
}

function formatFrequencyFull(habit: Habit): string {
  const f        = habit.frequency;
  const h        = f.hour % 12 || 12;
  const m        = f.minute.toString().padStart(2, '0');
  const period   = f.hour >= 12 ? 'PM' : 'AM';
  const time     = `${h}:${m} ${period}`;
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  switch (f.kind) {
    case 'daily':    return `Every day at ${time}`;
    case 'weekly':   return `${f.weekdays.map(d => DAY_NAMES[d - 1]).join(', ')} at ${time}`;
    case 'weekdays': return `Monday to Friday at ${time}`;
    case 'weekends': return `Saturday & Sunday at ${time}`;
    case 'xperweek': return `${f.count} times per week at ${time}`;
    case 'interval': return `Every ${f.days} days at ${time}`;
    default:         return `at ${time}`;
  }
}

// ── Streak Calendar ───────────────────────────────────────────────────────────

function StreakCalendar({ habit }: { habit: Habit }) {
  const C = useColors();
  const cal = useMemo(() => createCalStyles(C), [C]);
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const todayKey      = toDateKey(now);
  const completedKeys = getCompletionDateKeys(habit);
  const createdAt     = new Date(habit.createdAt);

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
            const isToday     = key === todayKey;
            const isCompleted = completedKeys.has(key);

            return (
              <View key={di} style={cal.cell}>
                <View style={[
                  cal.dayCircle,
                  isCompleted && { backgroundColor: habit.color },
                  isToday && !isCompleted && cal.dayCircleToday,
                  isToday && isCompleted && { borderWidth: 2.5, borderColor: '#fff' },
                ]}>
                  <Text style={[
                    cal.dayText,
                    isCompleted && cal.dayTextStreak,
                    isToday && !isCompleted && cal.dayTextToday,
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
          <Text style={cal.legendText}>Completed</Text>
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
  const { habits, markDone, updateHabit, deleteHabit, pauseHabit, archiveHabit, restoreHabit } = useHabitsStore();
  const { awardXP } = useGamification();

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

  const stats = useMemo(
    () => computeHabitStats(habit.completions ?? [], habit.createdAt, habit.frequency),
    [habit.completions, habit.createdAt, habit.frequency],
  );

  const momentumColor =
    stats.momentum >= 71 ? C.done :
    stats.momentum >= 41 ? C.streak :
    C.danger;

  const reminderSuggestion = useMemo(
    () => analyzeReminderEffectiveness(habit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habit.completionTimestamps, habit.frequency.hour],
  );

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

        {/* ── Paused banner ── */}
        {habit.status === 'paused' && (
          <View style={styles.pausedBanner}>
            <Ionicons name="pause-circle" size={16} color="#EA580C" />
            <Text style={styles.pausedBannerText}>
              Habit paused — notifications and streak tracking are suspended.
            </Text>
          </View>
        )}

        {/* ── Mark Done (disabled when paused) ── */}
        <TouchableOpacity
          style={[styles.doneBtn, done && styles.doneBtnDone, habit.status === 'paused' && { opacity: 0.4 }]}
          onPress={async () => {
            const result = await markDone(habit.id);
            if (result.wasAdded) {
              awardXP(XP_COMPLETE_HABIT, {}, habits).catch(console.error);
            }
          }}
          disabled={done || habit.status === 'paused'}
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

        {/* ── Freeze status callout ── */}
        {(() => {
          const freezes    = habit.freezesAvailable ?? 0;
          const yesterday  = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
          const usedYest   = (habit.freezeUsedDates ?? []).includes(yesterday);
          if (!usedYest && freezes === 0) return null;
          const label = usedYest
            ? `Freeze used yesterday — streak protected · ${freezes} ${freezes === 1 ? 'token' : 'tokens'} left`
            : `${freezes} streak ${freezes === 1 ? 'freeze' : 'freezes'} available — ${freezes === 1 ? 'one' : freezes} missed day${freezes > 1 ? 's' : ''} covered`;
          return (
            <View style={styles.freezeCallout}>
              <Ionicons name="snow-outline" size={16} color="#3B82F6" />
              <Text style={styles.freezeCalloutText}>{label}</Text>
            </View>
          );
        })()}

        {/* ── Statistics ── */}
        <Text style={styles.sectionLabel}>Statistics</Text>
        {habit.completions.length >= 3 ? (
          <View style={[styles.statsSection, { backgroundColor: C.surface, borderColor: C.border }]}>

            {/* Completion rate bars — 7 / 30 / 90 days */}
            <View style={styles.rateGrid}>
              {([
                { label: '7 days',  rate: stats.rate7d  },
                { label: '30 days', rate: stats.rate30d },
                { label: '90 days', rate: stats.rate90d },
              ] as const).map(({ label, rate }) => (
                <View key={label} style={styles.rateCell}>
                  <Text style={styles.ratePct}>{Math.round(rate * 100)}%</Text>
                  <View style={styles.rateTrack}>
                    <View style={[styles.rateFill, {
                      width: `${Math.max(4, Math.round(rate * 100))}%` as unknown as number,
                      backgroundColor: habit.color,
                    }]} />
                  </View>
                  <Text style={styles.rateLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.statsSectionDivider} />

            {/* Bottom metrics — Total / Best Day / Momentum */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCell}>
                <Text style={styles.metricValue}>{stats.total}</Text>
                <Text style={styles.metricLabel}>Total</Text>
              </View>
              <View style={[styles.metricCell, styles.metricBorder]}>
                <Text style={styles.metricValue}>{stats.bestDay ?? '—'}</Text>
                <Text style={styles.metricLabel}>Best day</Text>
              </View>
              <View style={[styles.metricCell, styles.metricBorder]}>
                <View style={styles.momentumRow}>
                  <Text style={[styles.metricValue, { color: momentumColor }]}>
                    {stats.momentum}
                  </Text>
                  <Text style={[styles.momentumMax, { color: C.textMuted }]}>/100</Text>
                </View>
                <Text style={styles.metricLabel}>Momentum</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.statsSection, styles.statsSectionEmpty, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Ionicons name="stats-chart-outline" size={22} color={C.textMuted} />
            <Text style={[styles.metricLabel, { textAlign: 'center' }]}>
              Track for a few more days to unlock statistics
            </Text>
          </View>
        )}

        {/* ── Smart Reminder Suggestion ── */}
        {reminderSuggestion && (
          <TouchableOpacity
            style={styles.reminderBanner}
            activeOpacity={0.85}
            onPress={() => {
              Alert.alert(
                'Update reminder time?',
                `You complete this habit ${Math.round(reminderSuggestion.suggestedRate * 100)}% of the time when done by ${reminderSuggestion.suggestedLabel}, vs ${Math.round(reminderSuggestion.currentRate * 100)}% at your current ${reminderSuggestion.currentLabel} reminder.\n\nSwitch to ${reminderSuggestion.suggestedLabel}?`,
                [
                  { text: 'Keep current', style: 'cancel' },
                  {
                    text: `Switch to ${reminderSuggestion.suggestedLabel}`,
                    onPress: () =>
                      updateHabit(habit.id, {
                        frequency: { ...habit.frequency, hour: reminderSuggestion.suggestedHour, minute: 0 },
                      }),
                  },
                ],
              );
            }}
          >
            <View style={styles.reminderBannerIcon}>
              <Ionicons name="bulb-outline" size={18} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderBannerTitle}>Smarter reminder time available</Text>
              <Text style={styles.reminderBannerBody}>
                You complete this habit {Math.round(reminderSuggestion.suggestedRate * 100)}% when done by {reminderSuggestion.suggestedLabel}, vs {Math.round(reminderSuggestion.currentRate * 100)}% at your current {reminderSuggestion.currentLabel} reminder. Tap to update.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#7C3AED" />
          </TouchableOpacity>
        )}

        {/* ── Calendar streak view ── */}
        <Text style={styles.sectionLabel}>Streak History</Text>
        <StreakCalendar habit={habit} />

        {/* ── Actions ── */}
        <Text style={styles.sectionLabel}>Actions</Text>
        <View style={[styles.actionsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          {/* Pause / Resume */}
          {habit.status === 'active' && (
            <TouchableOpacity
              style={[styles.actionRow, styles.actionBorder]}
              onPress={() => {
                Alert.alert('Pause habit', `Pause "${habit.name}"? Notifications will be suspended and your streak won't decay.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Pause', onPress: () => pauseHabit(habit.id) },
                ]);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FFF7ED' }]}>
                <Ionicons name="pause-circle-outline" size={18} color="#EA580C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionLabel, { color: C.text }]}>Pause Habit</Text>
                <Text style={styles.actionSub}>Suspend notifications, freeze streak</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
            </TouchableOpacity>
          )}
          {habit.status === 'paused' && (
            <TouchableOpacity
              style={[styles.actionRow, styles.actionBorder]}
              onPress={() => restoreHabit(habit.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: C.doneLight }]}>
                <Ionicons name="play-circle-outline" size={18} color={C.done} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionLabel, { color: C.text }]}>Resume Habit</Text>
                <Text style={styles.actionSub}>Restore notifications and tracking</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
            </TouchableOpacity>
          )}

          {/* Archive / Restore */}
          {habit.status !== 'archived' ? (
            <TouchableOpacity
              style={[styles.actionRow, styles.actionBorder]}
              onPress={() => {
                Alert.alert('Archive habit', `Archive "${habit.name}"? It will be hidden but your history is preserved.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Archive', onPress: () => { archiveHabit(habit.id); router.back(); } },
                ]);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: C.surfaceAlt }]}>
                <Ionicons name="archive-outline" size={18} color={C.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionLabel, { color: C.text }]}>Archive Habit</Text>
                <Text style={styles.actionSub}>Hide it, keep history intact</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionRow, styles.actionBorder]}
              onPress={() => { restoreHabit(habit.id); router.back(); }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: C.tintLight }]}>
                <Ionicons name="refresh-circle-outline" size={18} color={C.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionLabel, { color: C.text }]}>Restore Habit</Text>
                <Text style={styles.actionSub}>Make it active again</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
            </TouchableOpacity>
          )}

          {/* Delete */}
          <TouchableOpacity style={styles.actionRow} onPress={confirmDelete} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: C.dangerLight }]}>
              <Ionicons name="trash-outline" size={18} color={C.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: C.danger }]}>Delete Habit</Text>
              <Text style={styles.actionSub}>Permanently remove all data</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={C.danger} />
          </TouchableOpacity>
        </View>
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

  pausedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  pausedBannerText: { flex: 1, fontSize: 13, color: '#EA580C', fontWeight: '500', lineHeight: 18 },

  freezeCallout: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  freezeCalloutText: { flex: 1, fontSize: 13, color: '#2563EB', fontWeight: '500', lineHeight: 18 },

  // Statistics section
  statsSection: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden', padding: 16, gap: 0,
  },
  statsSectionEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20,
  },
  statsSectionDivider: { height: 1, backgroundColor: C.border, marginVertical: 14 },

  rateGrid: { flexDirection: 'row', gap: 4 },
  rateCell: { flex: 1, gap: 6 },
  ratePct:  { fontSize: 18, fontWeight: '700', color: C.text },
  rateTrack: { height: 5, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
  rateFill:  { height: 5, borderRadius: 3 },
  rateLabel: { fontSize: 11, color: C.textMuted, fontWeight: '500' },

  metricsRow: { flexDirection: 'row' },
  metricCell: { flex: 1, alignItems: 'center', gap: 3 },
  metricBorder: { borderLeftWidth: 1, borderLeftColor: C.border },
  metricValue: { fontSize: 18, fontWeight: '700', color: C.text },
  metricLabel: { fontSize: 11, color: C.textMuted, fontWeight: '500' },
  momentumRow: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  momentumMax: { fontSize: 11, fontWeight: '500' },

  reminderBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F5F3FF', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  reminderBannerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EDE9FE',
    alignItems: 'center', justifyContent: 'center',
  },
  reminderBannerTitle: { fontSize: 13, fontWeight: '700', color: '#5B21B6', marginBottom: 2 },
  reminderBannerBody: { fontSize: 12, color: '#6D28D9', lineHeight: 17 },

  actionsCard: {
    borderRadius: 14, borderWidth: 1, overflow: 'hidden',
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  actionBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  actionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 15, fontWeight: '600' },
  actionSub: { fontSize: 12, color: C.textMuted, marginTop: 1 },

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
