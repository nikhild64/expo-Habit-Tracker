import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, EmptyState, ProgressRing } from '@/components/ui';
import { YearHeatmap } from '@/components/YearHeatmap';
import { useHabitsStore } from '@/contexts/HabitsContext';
import { useColors } from '@/contexts/ThemeContext';
import { completionRate } from '@/lib/habits/stats';
import { computeStrengthScore } from '@/lib/habits/streak';
import type { Habit } from '@/lib/habits/types';
import type { Colors } from '@/lib/ui/theme';

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildHourDistribution(habits: Habit[]): number[] {
  const buckets = new Array(24).fill(0);
  for (const h of habits) {
    const stamps = h.completionTimestamps ?? {};
    for (const iso of Object.values(stamps)) {
      const hour = new Date(iso).getHours();
      buckets[hour] += 1;
    }
  }
  return buckets;
}

function buildHeatmapMap(habits: Habit[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of habits) {
    for (const d of (h.completions ?? [])) {
      m.set(d, (m.get(d) ?? 0) + 1);
    }
  }
  return m;
}

/**
 * Pairwise correlation: how much more often is habit B completed on days A is completed,
 * vs. days A is not. Returns top insights.
 */
function findCorrelations(habits: Habit[]): Array<{ aName: string; bName: string; lift: number }> {
  const eligible = habits.filter(h => (h.completions ?? []).length >= 5);
  if (eligible.length < 2) return [];

  const allDates = new Set<string>();
  for (const h of eligible) for (const d of (h.completions ?? [])) allDates.add(d);
  if (allDates.size < 10) return [];

  const results: Array<{ aName: string; bName: string; lift: number }> = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = 0; j < eligible.length; j++) {
      if (i === j) continue;
      const a = eligible[i];
      const b = eligible[j];
      const aSet = new Set(a.completions ?? []);
      const bSet = new Set(b.completions ?? []);
      const aDates = [...allDates].filter(d => aSet.has(d));
      const notADates = [...allDates].filter(d => !aSet.has(d));
      if (aDates.length < 5 || notADates.length < 5) continue;
      const pBgivenA    = aDates.filter(d => bSet.has(d)).length / aDates.length;
      const pBgivenNotA = notADates.filter(d => bSet.has(d)).length / notADates.length;
      if (pBgivenNotA === 0) continue;
      const lift = pBgivenA / pBgivenNotA;
      if (lift > 1.5) {
        results.push({ aName: a.name, bName: b.name, lift });
      }
    }
  }
  results.sort((a, b) => b.lift - a.lift);
  return results.slice(0, 3);
}

// ── Sub-components ──────────────────────────────────────────────────────────

function HourBars({ buckets, C, accent }: { buckets: number[]; C: Colors; accent: string }) {
  const max = Math.max(...buckets, 1);
  return (
    <View style={hb.wrap}>
      <View style={hb.barRow}>
        {buckets.map((v, i) => (
          <View key={i} style={hb.barCol}>
            <View
              style={[
                hb.bar,
                {
                  height: Math.max(2, (v / max) * 80),
                  backgroundColor: v > 0 ? accent : C.surfaceAlt,
                },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={hb.labels}>
        {[0, 6, 12, 18, 23].map(h => (
          <Text key={h} style={[hb.label, { color: C.textMuted, left: `${(h / 23) * 100}%` }]}>
            {h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
          </Text>
        ))}
      </View>
    </View>
  );
}

function StrengthRow({ habit, C }: { habit: Habit; C: Colors }) {
  const strength = habit.strengthScore ?? computeStrengthScore(habit);
  const color = strength >= 70 ? C.done : strength >= 40 ? C.streak : C.danger;
  return (
    <TouchableOpacity
      style={[sr.row, { borderColor: C.border }]}
      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
      activeOpacity={0.8}
    >
      <View style={[sr.icon, { backgroundColor: habit.color }]}>
        <Ionicons name={habit.icon as never} size={16} color="#fff" />
      </View>
      <Text style={[sr.name, { color: C.text }]} numberOfLines={1}>{habit.name}</Text>
      <View style={sr.barTrack}>
        <View style={[sr.barFill, { width: `${strength}%`, backgroundColor: color }]} />
      </View>
      <Text style={[sr.score, { color }]}>{strength}</Text>
    </TouchableOpacity>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { habits, loadFresh } = useHabitsStore();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.selectionAsync().catch(() => null);
    try { await loadFresh(); } finally {
      setRefreshing(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    }
  }, [loadFresh]);
  const visibleHabits = useMemo(
    () => habits.filter(h => (h.status ?? 'active') !== 'archived'),
    [habits],
  );

  const heatmapMap = useMemo(() => buildHeatmapMap(visibleHabits), [visibleHabits]);
  const hourDist   = useMemo(() => buildHourDistribution(visibleHabits), [visibleHabits]);
  const correlations = useMemo(() => findCorrelations(visibleHabits), [visibleHabits]);

  // Overall strength average
  const overallStrength = useMemo(() => {
    const scored = visibleHabits
      .filter(h => (h.completions ?? []).length > 0)
      .map(h => h.strengthScore ?? computeStrengthScore(h));
    if (scored.length === 0) return 0;
    return Math.round(scored.reduce((s, n) => s + n, 0) / scored.length);
  }, [visibleHabits]);

  const overallColor =
    overallStrength >= 70 ? C.done : overallStrength >= 40 ? C.streak : C.danger;

  // Overall 7/30/90 day rates
  const [windowDays, setWindowDays] = useState<7 | 30 | 90 | 365>(30);
  const overallRate = useMemo(() => {
    if (visibleHabits.length === 0) return 0;
    const rates = visibleHabits.map(h =>
      completionRate(h.completions ?? [], windowDays, h.createdAt, h.frequency),
    );
    return rates.reduce((s, r) => s + r, 0) / rates.length;
  }, [visibleHabits, windowDays]);

  if (visibleHabits.length === 0) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={s.title}>Insights</Text>
          <View style={{ width: 38 }} />
        </View>
        <EmptyState
          icon="analytics-outline"
          title="No data yet"
          body="Track a few habits and check back here for insights."
          primaryAction={{ label: 'Create habit', icon: 'add', onPress: () => router.push('/new') }}
        />
      </SafeAreaView>
    );
  }

  const max = Math.max(1, visibleHabits.length);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.title}>Insights</Text>
        <TouchableOpacity
          onPress={() => router.push('/year-in-review' as never)}
          style={s.backBtn}
          hitSlop={10}
        >
          <Ionicons name="trophy-outline" size={20} color={C.tint} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.tint}
            colors={[C.tint]}
          />
        }
      >
        {/* ── Habit Strength gauge ── */}
        <Card>
          <View style={s.strengthRow}>
            <ProgressRing
              progress={overallStrength / 100}
              size={120}
              stroke={10}
              color={overallColor}
              label={`${overallStrength}`}
            />
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={[s.metricHeading, { color: C.textMuted }]}>HABIT STRENGTH</Text>
              <Text style={[s.metricSub, { color: C.text }]}>
                {overallStrength >= 70 ? 'Strong — keep going!' :
                 overallStrength >= 40 ? 'Building momentum' :
                 'Time to rebuild'}
              </Text>
              <Text style={[s.metricExplain, { color: C.textMuted }]}>
                A forgiving, recent-weighted score that ignores ancient missed days.
              </Text>
            </View>
          </View>
        </Card>

        {/* ── Window selector + completion rate ── */}
        <View style={s.windowRow}>
          {[7, 30, 90, 365].map(w => (
            <TouchableOpacity
              key={w}
              style={[s.windowChip, { backgroundColor: windowDays === w ? C.tint : C.surfaceAlt, borderColor: windowDays === w ? C.tint : C.border }]}
              onPress={() => setWindowDays(w as 7 | 30 | 90 | 365)}
            >
              <Text style={[s.windowText, { color: windowDays === w ? '#fff' : C.textSecondary }]}>
                {w === 365 ? '1 yr' : `${w}d`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Card>
          <Text style={[s.metricHeading, { color: C.textMuted }]}>COMPLETION RATE — LAST {windowDays === 365 ? 'YEAR' : `${windowDays} DAYS`}</Text>
          <View style={s.bigRateRow}>
            <Text style={[s.bigRate, { color: C.text }]}>{Math.round(overallRate * 100)}%</Text>
            <Text style={[s.bigRateSub, { color: C.textMuted }]}>across {visibleHabits.length} habits</Text>
          </View>
          <View style={[s.bigBar, { backgroundColor: C.border }]}>
            <View style={[s.bigBarFill, { width: `${Math.round(overallRate * 100)}%`, backgroundColor: C.tint }]} />
          </View>
        </Card>

        {/* ── Year heatmap ── */}
        <Text style={s.sectionLabel}>Year activity</Text>
        <Card>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <YearHeatmap completionsByDate={heatmapMap} maxCount={max} color={C.tint} />
          </ScrollView>
          <View style={s.legendRow}>
            <Text style={[s.legendText, { color: C.textMuted }]}>Less</Text>
            {[0, 0.2, 0.5, 0.75, 1].map((ratio, i) => (
              <View
                key={i}
                style={[
                  s.legendChip,
                  {
                    backgroundColor: ratio === 0
                      ? C.surfaceAlt
                      : C.tint + (ratio < 0.5 ? '40' : ratio < 0.75 ? '80' : 'FF'),
                  },
                ]}
              />
            ))}
            <Text style={[s.legendText, { color: C.textMuted }]}>More</Text>
          </View>
        </Card>

        {/* ── Time of day ── */}
        <Text style={s.sectionLabel}>Time of day you complete</Text>
        <Card>
          <HourBars buckets={hourDist} C={C} accent={C.tint} />
        </Card>

        {/* ── Per-habit strength rows ── */}
        <Text style={s.sectionLabel}>Per-habit strength</Text>
        <Card>
          <View style={{ gap: 10 }}>
            {visibleHabits.map(h => <StrengthRow key={h.id} habit={h} C={C} />)}
          </View>
        </Card>

        {/* ── Correlations ── */}
        {correlations.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Patterns we noticed</Text>
            <Card>
              <View style={{ gap: 12 }}>
                {correlations.map((c, i) => (
                  <View key={i} style={s.corrRow}>
                    <View style={[s.corrDot, { backgroundColor: C.tint }]}>
                      <Ionicons name="link-outline" size={12} color="#fff" />
                    </View>
                    <Text style={[s.corrText, { color: C.text }]}>
                      You complete <Text style={{ fontWeight: '700' }}>{c.bName}</Text> {Math.round((c.lift - 1) * 100)}% more often on days you complete <Text style={{ fontWeight: '700' }}>{c.aName}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

function createStyles(C: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 17, fontWeight: '700', color: C.text },
    content: { padding: 16, gap: 12, paddingBottom: 48 },

    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.8,
      marginTop: 4, marginBottom: 2,
    },

    strengthRow: { flexDirection: 'row', alignItems: 'center' },
    metricHeading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
    metricSub: { fontSize: 16, fontWeight: '700', marginTop: 4 },
    metricExplain: { fontSize: 12, lineHeight: 17, marginTop: 4 },

    windowRow: { flexDirection: 'row', gap: 8 },
    windowChip: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
    windowText: { fontSize: 13, fontWeight: '700' },

    bigRateRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
    bigRate: { fontSize: 44, fontWeight: '800', letterSpacing: -1 },
    bigRateSub: { fontSize: 12, fontWeight: '500' },
    bigBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
    bigBarFill: { height: 6, borderRadius: 3 },

    legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8 },
    legendText: { fontSize: 11, marginHorizontal: 2 },
    legendChip: { width: 14, height: 14, borderRadius: 3 },

    corrRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    corrDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    corrText: { flex: 1, fontSize: 13, lineHeight: 19 },
  });
}

const hb = StyleSheet.create({
  wrap: { gap: 10 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', height: 84, gap: 1 },
  barCol: { flex: 1, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3, minHeight: 2 },
  labels: { position: 'relative', height: 14 },
  label: { position: 'absolute', fontSize: 9, fontWeight: '600', transform: [{ translateX: -8 }] },
});

const sr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { width: 80, fontSize: 13, fontWeight: '600' },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#0001', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  score: { width: 32, textAlign: 'right', fontSize: 13, fontWeight: '700' },
});
