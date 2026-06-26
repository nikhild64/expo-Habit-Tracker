import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGamification } from '@/contexts/GamificationContext';
import { useHabitsStore } from '@/contexts/HabitsContext';
import { useMood } from '@/contexts/MoodContext';
import { useColors } from '@/contexts/ThemeContext';
import { LEVELS } from '@/lib/gamification/rules';
import { MOOD_EMOJI } from '@/lib/mood/storage';
import { toDateKey } from '@/lib/habits/streak';
import type { Colors } from '@/lib/ui/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, C }: {
  label: string; value: string | number;
  icon: string; color: string; C: Colors;
}) {
  return (
    <View style={[sc.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={[sc.icon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon as never} size={18} color={color} />
      </View>
      <Text style={[sc.value, { color: C.text }]}>{value}</Text>
      <Text style={[sc.label, { color: C.textMuted }]}>{label}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { profile, levelInfo, loading, refreshQuests } = useGamification();
  const { habits, loadFresh } = useHabitsStore();
  const { today: moodToday } = useMood();
  const [refreshing, setRefreshing] = useState(false);
  const [achievementsExpanded, setAchievementsExpanded] = useState(false);

  const activeHabits  = useMemo(() => habits.filter(h => (h.status ?? 'active') === 'active'), [habits]);
  const unlockedCount = useMemo(
    () => (profile?.achievements ?? []).filter(a => a.unlockedAt !== null).length,
    [profile],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.selectionAsync().catch(() => null);
    try {
      await loadFresh();
      await refreshQuests(habits);
    } finally {
      setRefreshing(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    }
  }, [loadFresh, refreshQuests, habits]);

  // Re-evaluate today's quests when habits change so card stays fresh
  useEffect(() => {
    if (!loading) refreshQuests(habits).catch(() => null);
  }, [habits, loading, refreshQuests]);

  if (loading || !profile || !levelInfo) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.loadingWrap}>
          <Text style={{ color: C.textMuted, fontSize: 14 }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { current: level, progress, xpInLevel, xpForLevel } = levelInfo;
  const xpToNext = level.maxXP === -1 ? null : xpForLevel - xpInLevel;

  // Determine next level title
  const nextLevelIdx  = LEVELS.findIndex(l => l.level === level.level + 1);
  const nextLevelName = nextLevelIdx >= 0 ? LEVELS[nextLevelIdx].title : null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.heading}>Profile</Text>
          <TouchableOpacity
            onPress={() => router.push('/shop' as never)}
            style={[s.coinPill, { backgroundColor: '#F59E0B22' }]}
            activeOpacity={0.85}
          >
            <Ionicons name="cash" size={14} color="#F59E0B" />
            <Text style={s.coinText}>{profile.coins ?? 0}</Text>
            <Ionicons name="chevron-forward" size={12} color="#F59E0B" />
          </TouchableOpacity>
        </View>

        {/* ── Quick actions ── */}
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => router.push('/insights' as never)}
            activeOpacity={0.85}
          >
            <Ionicons name="analytics-outline" size={18} color="#8B5CF6" />
            <Text style={[s.actionLabel, { color: C.text }]}>Insights</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => router.push({ pathname: '/journal/[date]', params: { date: toDateKey(new Date()) } } as never)}
            activeOpacity={0.85}
          >
            {moodToday?.morningMood || moodToday?.eveningMood
              ? <Text style={{ fontSize: 18 }}>{MOOD_EMOJI[moodToday.eveningMood ?? moodToday.morningMood ?? 3]}</Text>
              : <Ionicons name="journal-outline" size={18} color="#10B981" />
            }
            <Text style={[s.actionLabel, { color: C.text }]}>Journal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => router.push('/year-in-review' as never)}
            activeOpacity={0.85}
          >
            <Ionicons name="trophy-outline" size={18} color="#F59E0B" />
            <Text style={[s.actionLabel, { color: C.text }]}>Year</Text>
          </TouchableOpacity>
        </View>

        {/* ── Daily Quests ── */}
        {profile.dailyQuests && profile.dailyQuests.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: C.textMuted }]}>Daily Quests</Text>
            <View style={[s.questsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              {profile.dailyQuests.map((q, i) => (
                <View key={q.id} style={[s.questRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                  <View style={[s.questIcon, { backgroundColor: q.completed ? C.done + '22' : C.surfaceAlt }]}>
                    <Ionicons name={q.icon as never} size={18} color={q.completed ? C.done : C.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.questTitle, { color: q.completed ? C.textMuted : C.text, textDecorationLine: q.completed ? 'line-through' : 'none' }]}>
                      {q.title}
                    </Text>
                    <Text style={[s.questDesc, { color: C.textMuted }]}>{q.description}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <View style={[s.rewardPill, { backgroundColor: q.completed ? C.done + '22' : '#F59E0B22' }]}>
                      <Ionicons name="cash" size={10} color={q.completed ? C.done : '#F59E0B'} />
                      <Text style={[s.rewardText, { color: q.completed ? C.done : '#F59E0B' }]}>+{q.coinReward}</Text>
                    </View>
                    <View style={[s.rewardPill, { backgroundColor: q.completed ? C.done + '22' : C.surfaceAlt }]}>
                      <Ionicons name="star" size={10} color={q.completed ? C.done : C.textMuted} />
                      <Text style={[s.rewardText, { color: q.completed ? C.done : C.textMuted }]}>+{q.xpReward}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Level hero card ─────────────────────────────────────────────── */}
        <View style={[s.heroCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          {/* Accent bar */}
          <View style={[s.heroAccent, { backgroundColor: level.color }]} />

          <View style={s.heroBody}>
            {/* Badge */}
            <View style={[s.levelBadge, { backgroundColor: level.color }]}>
              <Text style={s.levelNum}>{level.level}</Text>
            </View>

            {/* Title + XP */}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.levelTitle, { color: level.color }]}>{level.title}</Text>
              <Text style={[s.xpTotal, { color: C.text }]}>{profile.xp.toLocaleString()} XP</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[s.xpTrack, { backgroundColor: level.color + '28' }]}>
            <View
              style={[
                s.xpFill,
                {
                  width: `${Math.round(Math.min(progress, 1) * 100)}%` as `${number}%`,
                  backgroundColor: level.color,
                },
              ]}
            />
          </View>

          {/* Label below bar */}
          <Text style={[s.xpHint, { color: C.textMuted }]}>
            {level.maxXP === -1
              ? 'Max level reached — legendary status!'
              : `${xpToNext} XP to ${nextLevelName}`
            }
          </Text>

          {/* Mini level ladder */}
          <View style={s.levelLadder}>
            {LEVELS.map(l => (
              <View
                key={l.level}
                style={[
                  s.ladderDot,
                  {
                    backgroundColor: profile.xp >= l.minXP ? l.color : C.border,
                    transform: [{ scale: l.level === level.level ? 1.3 : 1 }],
                  },
                ]}
              />
            ))}
          </View>
          <View style={s.levelLadderLabels}>
            {LEVELS.map(l => (
              <Text
                key={l.level}
                style={[
                  s.ladderLabel,
                  { color: l.level === level.level ? level.color : C.textMuted },
                  l.level === level.level && { fontWeight: '700' },
                ]}
              >
                {l.title.split(' ')[0]}
              </Text>
            ))}
          </View>
        </View>

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <View style={s.statsRow}>
          <StatCard
            label="Completions"
            value={profile.totalCompletions}
            icon="checkmark-done-outline"
            color={C.tint}
            C={C}
          />
          <StatCard
            label="Active habits"
            value={activeHabits.length}
            icon="flash-outline"
            color={C.streak}
            C={C}
          />
          <StatCard
            label="Badges"
            value={`${unlockedCount}/${profile.achievements.length}`}
            icon="trophy-outline"
            color="#F59E0B"
            C={C}
          />
        </View>

        {/* ── Achievements ────────────────────────────────────────────────── */}
        <Text style={[s.sectionLabel, { color: C.textMuted }]}>Achievements</Text>
        {(() => {
          const lockedCount = profile.achievements.length - unlockedCount;
          const visible = achievementsExpanded
            ? profile.achievements
            : profile.achievements.filter(a => a.unlockedAt !== null);
          return (
            <>
              <View style={s.achGrid}>
                {visible.map(ach => {
                  const unlocked = ach.unlockedAt !== null;
            return (
              <View
                key={ach.id}
                style={[
                  s.achCard,
                  { backgroundColor: C.surface, borderColor: unlocked ? ach.color + '55' : C.border },
                  !unlocked && s.achLocked,
                ]}
              >
                <View style={[s.achIconWrap, { backgroundColor: ach.color + '22' }]}>
                  <Ionicons
                    name={ach.icon as never}
                    size={22}
                    color={unlocked ? ach.color : C.textMuted}
                  />
                  {unlocked && (
                    <View style={[s.checkBadge, { backgroundColor: ach.color }]}>
                      <Ionicons name="checkmark" size={8} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={[s.achName, { color: unlocked ? C.text : C.textMuted }]} numberOfLines={1}>
                  {ach.name}
                </Text>
                <Text style={[s.achDesc, { color: C.textMuted }]} numberOfLines={2}>
                  {ach.description}
                </Text>
                <View style={s.achFooter}>
                  <View style={[s.xpPill, { backgroundColor: unlocked ? ach.color + '22' : C.surfaceAlt }]}>
                    <Ionicons name="star" size={9} color={unlocked ? ach.color : C.textMuted} />
                    <Text style={[s.xpPillText, { color: unlocked ? ach.color : C.textMuted }]}>
                      {ach.xpReward} XP
                    </Text>
                  </View>
                  {!unlocked && (
                    <Ionicons name="lock-closed-outline" size={12} color={C.textMuted} />
                  )}
                </View>
              </View>
            );
          })}
              </View>
              {lockedCount > 0 && (
                <TouchableOpacity
                  onPress={() => setAchievementsExpanded(v => !v)}
                  style={[s.expandBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={achievementsExpanded ? 'Hide locked achievements' : `Show ${lockedCount} locked achievements`}
                >
                  <Ionicons
                    name={achievementsExpanded ? 'chevron-up' : 'lock-closed-outline'}
                    size={14}
                    color={C.textSecondary}
                  />
                  <Text style={[s.expandLabel, { color: C.textSecondary }]}>
                    {achievementsExpanded
                      ? `Hide ${lockedCount} locked`
                      : `${lockedCount} locked · tap to view`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          );
        })()}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(C: Colors) {
  return StyleSheet.create({
    root:        { flex: 1, backgroundColor: C.bg },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content:     { padding: 20, paddingTop: 8, paddingBottom: 110, gap: 12 },
    heading:     { fontSize: 30, fontWeight: '700', color: C.text, letterSpacing: -0.5, marginBottom: 4, paddingTop: 8 },
    sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },

    // Hero card
    heroCard: {
      borderRadius: 20, borderWidth: 1,
      padding: 18, gap: 10, overflow: 'hidden',
    },
    heroAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    heroBody: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    levelBadge: {
      width: 56, height: 56, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    levelNum:   { fontSize: 26, fontWeight: '900', color: '#fff' },
    levelTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
    xpTotal:    { fontSize: 14, fontWeight: '600' },

    xpTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    xpFill:  { height: 8, borderRadius: 4 },
    xpHint:  { fontSize: 12 },

    levelLadder: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginTop: 4,
    },
    ladderDot:   { width: 10, height: 10, borderRadius: 5 },
    levelLadderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    ladderLabel: { fontSize: 9, flex: 1, textAlign: 'center' },

    // Stats row
    statsRow: { flexDirection: 'row', gap: 8 },

    // Achievement grid
    achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    achCard: {
      width: '48%',
      borderRadius: 16, borderWidth: 1,
      padding: 14, gap: 5,
    },
    achLocked:   { opacity: 0.5 },
    achIconWrap: {
      width: 44, height: 44, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 2,
    },
    checkBadge: {
      position: 'absolute', bottom: -2, right: -2,
      width: 16, height: 16, borderRadius: 8,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
    },
    achName: { fontSize: 13, fontWeight: '700' },
    achDesc: { fontSize: 11, lineHeight: 16 },
    achFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    xpPill:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
    xpPillText: { fontSize: 10, fontWeight: '700' },

    coinPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
    coinText: { fontSize: 14, fontWeight: '800', color: '#F59E0B' },
    actionRow: { flexDirection: 'row', gap: 8 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 12 },
    actionLabel: { fontSize: 13, fontWeight: '700' },
    questsCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
    questRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
    questIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    questTitle: { fontSize: 14, fontWeight: '700' },
    questDesc:  { fontSize: 11, marginTop: 1 },
    rewardPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    rewardText: { fontSize: 10, fontWeight: '700' },

    expandBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 12, borderWidth: 1, paddingVertical: 12, marginTop: 4,
    },
    expandLabel: { fontSize: 13, fontWeight: '600' },
  });
}

// StatCard static styles
const sc = StyleSheet.create({
  card:  { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 6 },
  icon:  { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
});
