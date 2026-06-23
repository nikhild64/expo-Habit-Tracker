import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHabitsStore } from '@/contexts/HabitsContext';
import { useColors } from '@/contexts/ThemeContext';
import { toDateKey } from '@/lib/habits/streak';
import type { Habit } from '@/lib/habits/types';
import type { Colors } from '@/lib/ui/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

function completedYesterday(habit: Habit): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (habit.completions ?? []).includes(toDateKey(yesterday));
}

function yesterdayLabel(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SummaryScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { habits } = useHabitsStore();

  const done = habits.filter(completedYesterday);
  const missed = habits.filter(h => !completedYesterday(h));
  const total = habits.length;
  const doneCount = done.length;
  const progress = total > 0 ? doneCount / total : 0;
  const streaksAtRisk = missed.filter(h => h.streak > 0);

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
          <Text style={s.title}>Daily Summary</Text>
          <Text style={s.subtitle}>{yesterdayLabel()}</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {total === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="leaf-outline" size={36} color={C.textMuted} />
            <Text style={s.emptyTitle}>No habits yet</Text>
            <Text style={s.emptyBody}>Create habits to see your daily summary here.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/new')} activeOpacity={0.8}>
              <Text style={s.emptyBtnText}>Create first habit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Overall progress */}
            <View style={s.overviewCard}>
              <Text style={s.overviewTitle}>
                {doneCount === total
                  ? 'Perfect day! All habits completed.'
                  : doneCount === 0
                  ? 'No habits completed yesterday.'
                  : `${doneCount} of ${total} habits completed`}
              </Text>
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    {
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor: doneCount === total ? C.done : C.tint,
                    },
                  ]}
                />
              </View>
              <Text style={s.progressPct}>{Math.round(progress * 100)}%</Text>
            </View>

            {/* Completed */}
            {done.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Completed</Text>
                <View style={s.list}>
                  {done.map((h, i) => (
                    <View key={h.id} style={[s.row, i < done.length - 1 && s.rowBorder]}>
                      <View style={[s.iconBadge, { backgroundColor: h.color }]}>
                        <Ionicons name={h.icon as never} size={16} color="#fff" />
                      </View>
                      <Text style={s.rowName}>{h.name}</Text>
                      <View style={s.streakTag}>
                        <Ionicons name="flame" size={12} color={C.streak} />
                        <Text style={s.streakTagText}>{h.streak}d</Text>
                      </View>
                      <Ionicons name="checkmark-circle" size={20} color={C.done} />
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Missed */}
            {missed.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Missed</Text>
                <View style={s.list}>
                  {missed.map((h, i) => (
                    <TouchableOpacity
                      key={h.id}
                      style={[s.row, i < missed.length - 1 && s.rowBorder]}
                      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })}
                      activeOpacity={0.7}
                    >
                      <View style={[s.iconBadge, { backgroundColor: h.color, opacity: 0.5 }]}>
                        <Ionicons name={h.icon as never} size={16} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.rowName, { color: C.textSecondary }]}>{h.name}</Text>
                        {h.streak > 0 && (
                          <Text style={s.streakReset}>Streak of {h.streak} at risk</Text>
                        )}
                      </View>
                      <Ionicons name="close-circle-outline" size={20} color={C.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Streaks at risk callout */}
            {streaksAtRisk.length > 0 && (
              <View style={s.riskCard}>
                <Ionicons name="warning-outline" size={16} color={C.streak} />
                <Text style={s.riskText}>
                  {streaksAtRisk.length === 1
                    ? `"${streaksAtRisk[0].name}" streak will reset if not done today.`
                    : `${streaksAtRisk.length} streaks will reset if not done today.`}
                </Text>
              </View>
            )}

            {/* CTA */}
            <TouchableOpacity
              style={s.ctaBtn}
              onPress={() => router.replace('/(tabs)' as never)}
              activeOpacity={0.8}
            >
              <Ionicons name="today-outline" size={18} color="#fff" />
              <Text style={s.ctaBtnText}>Go to Today's Habits</Text>
            </TouchableOpacity>
          </>
        )}
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
  title: { fontSize: 17, fontWeight: '700', color: C.text, textAlign: 'center' },
  subtitle: { fontSize: 12, color: C.textMuted, textAlign: 'center', marginTop: 2 },

  content: { padding: 20, gap: 12, paddingBottom: 48 },

  // Overview
  overviewCard: {
    backgroundColor: C.surface,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
    padding: 20, gap: 10,
  },
  overviewTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressPct: { fontSize: 13, color: C.textMuted, fontWeight: '500' },

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
  rowName: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  streakTag: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  streakTagText: { fontSize: 12, fontWeight: '600', color: C.streak },
  streakReset: { fontSize: 12, color: C.streak, marginTop: 2 },

  // Risk callout
  riskCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.streakLight, borderRadius: 12, padding: 14,
  },
  riskText: { flex: 1, fontSize: 14, color: C.streak, fontWeight: '500', lineHeight: 20 },

  // CTA
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.tint, borderRadius: 14, paddingVertical: 16,
    marginTop: 4,
  },
  ctaBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  // Empty
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
}); }
