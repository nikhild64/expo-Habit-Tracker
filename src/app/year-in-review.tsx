import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, EmptyState } from '@/components/ui';
import { YearHeatmap } from '@/components/YearHeatmap';
import { useHabitsStore } from '@/contexts/HabitsContext';
import { useColors } from '@/contexts/ThemeContext';
import type { Habit } from '@/lib/habits/types';
import type { Colors } from '@/lib/ui/theme';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function computeBestMonth(habits: Habit[]): { month: string; count: number } {
  const counts = new Map<string, number>();
  const now = new Date();
  const year = now.getFullYear();
  for (const h of habits) {
    for (const d of (h.completions ?? [])) {
      if (!d.startsWith(`${year}-`)) continue;
      const month = d.slice(0, 7); // YYYY-MM
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return { month: '—', count: 0 };
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [monthKey, count] = sorted[0];
  const m = parseInt(monthKey.slice(5), 10) - 1;
  return { month: MONTH_NAMES[m], count };
}

export default function YearInReviewScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { habits } = useHabitsStore();
  const visibleHabits = useMemo(
    () => habits.filter(h => (h.status ?? 'active') !== 'archived'),
    [habits],
  );

  const year = new Date().getFullYear();
  const totalCompletions = visibleHabits.reduce((s, h) => s + (h.completions ?? []).filter(d => d.startsWith(`${year}-`)).length, 0);
  const bestStreak = visibleHabits.reduce((m, h) => Math.max(m, h.bestStreak), 0);
  const topHabit = visibleHabits.length === 0
    ? null
    : visibleHabits.reduce((top, h) => {
        const hc = (h.completions ?? []).filter(d => d.startsWith(`${year}-`)).length;
        const tc = (top.completions ?? []).filter(d => d.startsWith(`${year}-`)).length;
        return hc > tc ? h : top;
      });
  const bestMonth = computeBestMonth(visibleHabits);

  const heatmapMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of visibleHabits) {
      for (const d of (h.completions ?? [])) {
        m.set(d, (m.get(d) ?? 0) + 1);
      }
    }
    return m;
  }, [visibleHabits]);

  if (visibleHabits.length === 0) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
            <Ionicons name="close" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={s.title}>{year} in Review</Text>
          <View style={{ width: 38 }} />
        </View>
        <EmptyState
          icon="trophy-outline"
          title="Your story starts here"
          body="Track some habits this year and revisit this page to see your highlights."
          primaryAction={{ label: 'Create habit', icon: 'add', onPress: () => router.push('/new') }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
          <Ionicons name="close" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.title}>{year} in Review</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Card>
          <View style={{ alignItems: 'center', paddingVertical: 14 }}>
            <Ionicons name="trophy" size={56} color="#F59E0B" />
            <Text style={[s.heroNum, { color: C.text }]}>{totalCompletions}</Text>
            <Text style={[s.heroLabel, { color: C.textMuted }]}>habit check-ins in {year}</Text>
          </View>
        </Card>

        <View style={s.statRow}>
          <Card style={{ flex: 1 }}>
            <Text style={[s.statLabel, { color: C.textMuted }]}>LONGEST STREAK</Text>
            <Text style={[s.statValue, { color: C.text }]}>{bestStreak}</Text>
            <Text style={[s.statSub, { color: C.textMuted }]}>days in a row</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={[s.statLabel, { color: C.textMuted }]}>BEST MONTH</Text>
            <Text style={[s.statValue, { color: C.text }]}>{bestMonth.month}</Text>
            <Text style={[s.statSub, { color: C.textMuted }]}>{bestMonth.count} check-ins</Text>
          </Card>
        </View>

        {topHabit && (
          <Card>
            <Text style={[s.statLabel, { color: C.textMuted }]}>TOP HABIT</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 }}>
              <View style={[s.topHabitBadge, { backgroundColor: topHabit.color }]}>
                <Ionicons name={topHabit.icon as never} size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.topName, { color: C.text }]}>{topHabit.name}</Text>
                <Text style={[s.topSub, { color: C.textMuted }]}>
                  {(topHabit.completions ?? []).filter(d => d.startsWith(`${year}-`)).length} completions · best streak {topHabit.bestStreak}
                </Text>
              </View>
            </View>
          </Card>
        )}

        <Text style={s.sectionLabel}>Your year, day by day</Text>
        <Card>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <YearHeatmap completionsByDate={heatmapMap} maxCount={Math.max(1, visibleHabits.length)} color={C.tint} />
          </ScrollView>
        </Card>

        <Card highlight={C.tint}>
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 6 }}>
            <Ionicons name="sparkles-outline" size={22} color={C.tint} />
            <Text style={[s.thanksTitle, { color: C.text }]}>Here's to another great year</Text>
            <Text style={[s.thanksBody, { color: C.textMuted }]}>
              Every check-in compounds. Keep showing up.
            </Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(C: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 17, fontWeight: '700', color: C.text },
    content: { padding: 16, gap: 12, paddingBottom: 48 },
    heroNum: { fontSize: 64, fontWeight: '800', letterSpacing: -2, marginTop: 6 },
    heroLabel: { fontSize: 14, marginTop: 2 },
    statRow: { flexDirection: 'row', gap: 10 },
    statLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
    statValue: { fontSize: 28, fontWeight: '800', marginTop: 6 },
    statSub: { fontSize: 12, marginTop: 2 },
    topHabitBadge: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    topName: { fontSize: 18, fontWeight: '700' },
    topSub: { fontSize: 12, marginTop: 2 },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4,
    },
    thanksTitle: { fontSize: 16, fontWeight: '700' },
    thanksBody: { fontSize: 13, textAlign: 'center' },
  });
}
