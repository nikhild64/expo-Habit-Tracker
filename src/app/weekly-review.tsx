import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHabitsStore } from '@/contexts/HabitsContext';
import { useColors } from '@/contexts/ThemeContext';
import { completionRate } from '@/lib/habits/stats';
import type { Habit } from '@/lib/habits/types';
import type { Colors } from '@/lib/ui/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekLabel(): string {
  const today = new Date();
  // ISO week: Monday = day 1
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, …
  const daysFromMonday = (dayOfWeek + 6) % 7;

  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-US', opts);

  const startStr = fmt(monday, { month: 'short', day: 'numeric' });
  const endStr   = fmt(sunday, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

/**
 * 7-day completion rate for a habit, using the same window/createdAt logic as
 * `completionRate` in stats.ts so a brand-new habit isn't unfairly penalised.
 */
function weekRate(habit: Habit): number {
  return completionRate(habit.completions ?? [], 7, habit.createdAt);
}

function motivationalMessage(score: number): string {
  if (score >= 0.9)
    return "Excellent week! You're absolutely crushing it — keep up the momentum!";
  if (score >= 0.7)
    return "Good week! You're building real consistency. Stay the course this week!";
  return "Every streak starts with a single day. Keep going — this week is a fresh chance!";
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function WeeklyReviewScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { habits } = useHabitsStore();

  const activeHabits = useMemo(
    () => habits.filter(h => (h.status ?? 'active') === 'active'),
    [habits],
  );

  const habitRates = useMemo(
    () => activeHabits.map(h => ({ habit: h, rate: weekRate(h) })),
    [activeHabits],
  );

  const overallScore = habitRates.length > 0
    ? habitRates.reduce((sum, { rate }) => sum + rate, 0) / habitRates.length
    : 0;

  const starEntry = habitRates.length > 0
    ? habitRates.reduce((best, cur) => cur.rate > best.rate ? cur : best)
    : null;

  const attentionEntry = habitRates.length > 1
    ? habitRates.reduce((worst, cur) => cur.rate < worst.rate ? cur : worst)
    : null;

  const scoreColor =
    overallScore >= 0.9 ? C.done
    : overallScore >= 0.7 ? C.streak
    : C.tint;

  const message = motivationalMessage(overallScore);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View>
          <Text style={s.title}>Weekly Review</Text>
          <Text style={s.subtitle}>{weekLabel()}</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {activeHabits.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="calendar-outline" size={36} color={C.textMuted} />
            <Text style={s.emptyTitle}>No habits yet</Text>
            <Text style={s.emptyBody}>
              Create habits to see your weekly review here.
            </Text>
            <TouchableOpacity
              style={s.emptyBtn}
              onPress={() => router.push('/new')}
              activeOpacity={0.8}
            >
              <Text style={s.emptyBtnText}>Create first habit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Overall score */}
            <View style={s.scoreCard}>
              <Text style={s.scoreLabel}>Overall Score</Text>
              <Text style={[s.scoreValue, { color: scoreColor }]}>
                {Math.round(overallScore * 100)}%
              </Text>
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    {
                      width: `${Math.round(overallScore * 100)}%` as `${number}%`,
                      backgroundColor: scoreColor,
                    },
                  ]}
                />
              </View>
              <Text style={s.scoreCaption}>
                Averaged across {activeHabits.length} active habit
                {activeHabits.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {/* Star & needs-attention highlight cards (only when 2+ habits) */}
            {habitRates.length > 1 && starEntry && attentionEntry && (
              <View style={s.highlightRow}>
                <View style={[s.highlightCard, { flex: 1 }]}>
                  <View style={[s.highlightIcon, { backgroundColor: '#CA8A0422' }]}>
                    <Ionicons name="star" size={18} color="#CA8A04" />
                  </View>
                  <Text style={s.highlightHeader}>Top Habit</Text>
                  <Text style={s.highlightName} numberOfLines={1}>
                    {starEntry.habit.name}
                  </Text>
                  <Text style={[s.highlightRate, { color: C.done }]}>
                    {Math.round(starEntry.rate * 100)}%
                  </Text>
                </View>

                <View style={[s.highlightCard, { flex: 1 }]}>
                  <View style={[s.highlightIcon, { backgroundColor: C.danger + '22' }]}>
                    <Ionicons name="alert-circle-outline" size={18} color={C.danger} />
                  </View>
                  <Text style={s.highlightHeader}>Needs Attention</Text>
                  <Text style={s.highlightName} numberOfLines={1}>
                    {attentionEntry.habit.name}
                  </Text>
                  <Text style={[s.highlightRate, { color: C.danger }]}>
                    {Math.round(attentionEntry.rate * 100)}%
                  </Text>
                </View>
              </View>
            )}

            {/* Per-habit breakdown */}
            <Text style={s.sectionLabel}>This Week's Habits</Text>
            <View style={s.list}>
              {habitRates.map(({ habit, rate }, i) => {
                const barColor =
                  rate >= 0.9 ? C.done : rate >= 0.5 ? C.tint : C.danger;
                return (
                  <View
                    key={habit.id}
                    style={[s.row, i < habitRates.length - 1 && s.rowBorder]}
                  >
                    <View style={[s.iconBadge, { backgroundColor: habit.color }]}>
                      <Ionicons name={habit.icon as never} size={16} color="#fff" />
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={s.rowName}>{habit.name}</Text>
                      <View style={s.miniTrack}>
                        <View
                          style={[
                            s.miniFill,
                            {
                              width: `${Math.round(rate * 100)}%` as `${number}%`,
                              backgroundColor: barColor,
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <Text style={[s.rowPct, { color: barColor }]}>
                      {Math.round(rate * 100)}%
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Motivational message */}
            <View
              style={[
                s.messageCard,
                { borderColor: scoreColor + '40', backgroundColor: scoreColor + '18' },
              ]}
            >
              <Ionicons name="sparkles-outline" size={18} color={scoreColor} />
              <Text style={[s.messageText, { color: scoreColor }]}>{message}</Text>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={s.ctaBtn}
              onPress={() => router.replace('/(tabs)' as never)}
              activeOpacity={0.8}
            >
              <Ionicons name="today-outline" size={18} color="#fff" />
              <Text style={s.ctaBtnText}>Start This Week Strong</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(C: Colors) {
  return StyleSheet.create({
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
    title: { fontSize: 17, fontWeight: '700', color: C.text, textAlign: 'center' },
    subtitle: { fontSize: 12, color: C.textMuted, textAlign: 'center', marginTop: 2 },

    content: { padding: 20, gap: 12, paddingBottom: 48 },

    // Score card
    scoreCard: {
      backgroundColor: C.surface,
      borderRadius: 16, borderWidth: 1, borderColor: C.border,
      padding: 20, gap: 8,
    },
    scoreLabel: {
      fontSize: 12, fontWeight: '600', color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.8,
    },
    scoreValue: { fontSize: 48, fontWeight: '800', lineHeight: 54 },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
    progressFill:  { height: 6, borderRadius: 3 },
    scoreCaption:  { fontSize: 13, color: C.textMuted },

    // Highlight row
    highlightRow: { flexDirection: 'row', gap: 10 },
    highlightCard: {
      backgroundColor: C.surface,
      borderRadius: 14, borderWidth: 1, borderColor: C.border,
      padding: 14, gap: 4,
    },
    highlightIcon: {
      width: 34, height: 34, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 4,
    },
    highlightHeader: {
      fontSize: 11, fontWeight: '600', color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.6,
    },
    highlightName: { fontSize: 14, fontWeight: '600', color: C.text },
    highlightRate:  { fontSize: 20, fontWeight: '700' },

    sectionLabel: {
      fontSize: 12, fontWeight: '600', color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.8,
      marginTop: 4,
    },

    // Habit list
    list: {
      backgroundColor: C.surface,
      borderRadius: 14, borderWidth: 1, borderColor: C.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row', alignItems: 'center',
      gap: 12, paddingHorizontal: 16, paddingVertical: 14,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    iconBadge: {
      width: 34, height: 34, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    rowName: { fontSize: 15, fontWeight: '500', color: C.text },
    miniTrack: { height: 4, borderRadius: 2, backgroundColor: C.border, overflow: 'hidden' },
    miniFill:  { height: 4, borderRadius: 2 },
    rowPct:    { fontSize: 13, fontWeight: '600', minWidth: 36, textAlign: 'right' },

    // Message
    messageCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      borderRadius: 12, borderWidth: 1, padding: 14,
    },
    messageText: { flex: 1, fontSize: 14, fontWeight: '500', lineHeight: 20 },

    // CTA
    ctaBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, backgroundColor: C.tint, borderRadius: 14, paddingVertical: 16,
      marginTop: 4,
    },
    ctaBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },

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
  });
}
