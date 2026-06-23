import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGamification } from '@/contexts/GamificationContext';
import { useHabitsStore } from '@/contexts/HabitsContext';
import { useColors } from '@/contexts/ThemeContext';
import { LEVELS } from '@/lib/gamification/rules';
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
  const { profile, levelInfo, loading } = useGamification();
  const { habits } = useHabitsStore();

  const activeHabits  = useMemo(() => habits.filter(h => (h.status ?? 'active') === 'active'), [habits]);
  const unlockedCount = useMemo(
    () => (profile?.achievements ?? []).filter(a => a.unlockedAt !== null).length,
    [profile],
  );

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
      >
        <Text style={s.heading}>Profile</Text>

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
        <View style={s.achGrid}>
          {profile.achievements.map(ach => {
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
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(C: Colors) {
  return StyleSheet.create({
    root:        { flex: 1, backgroundColor: C.bg },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content:     { padding: 20, paddingTop: 8, paddingBottom: 40, gap: 12 },
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
  });
}

// StatCard static styles
const sc = StyleSheet.create({
  card:  { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 6 },
  icon:  { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
});
