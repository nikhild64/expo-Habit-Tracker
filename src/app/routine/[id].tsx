import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isDoneToday, useHabitsStore } from '@/contexts/HabitsContext';
import { useRoutinesStore } from '@/contexts/RoutinesContext';
import { useColors } from '@/contexts/ThemeContext';
import type { Habit } from '@/lib/habits/types';
import type { Colors } from '@/lib/ui/theme';

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RoutineDetailScreen() {
  const C      = useColors();
  const styles = useMemo(() => createStyles(C), [C]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const { routines, deleteRoutine, markRoutineCompleteForToday } = useRoutinesStore();
  const { habits, markDone }                                     = useHabitsStore();

  const routine = routines.find(r => r.id === id);

  // Resolve habit objects for this routine (skip any that have been deleted)
  const routineHabits = useMemo(
    () =>
      (routine?.habitIds ?? [])
        .map(hid => habits.find(h => h.id === hid))
        .filter((h): h is Habit => h != null),
    [routine?.habitIds, habits],
  );

  if (!routine) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Routine not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const doneCount  = routineHabits.filter(isDoneToday).length;
  const totalCount = routineHabits.length;
  const allDone    = totalCount > 0 && doneCount === totalCount;
  const pct        = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Toggle a single habit; auto-complete routine when all become done
  async function handleHabitToggle(habitId: string) {
    const result = await markDone(habitId);
    if (!result.wasAdded) return;
    const allNowDone = routineHabits.every(h =>
      h.id === habitId ? true : isDoneToday(h),
    );
    if (allNowDone) {
      await markRoutineCompleteForToday(routine.id);
    }
  }

  // Mark every undone habit done at once
  async function handleMarkAllDone() {
    for (const h of routineHabits) {
      if (!isDoneToday(h)) await markDone(h.id);
    }
    await markRoutineCompleteForToday(routine.id);
  }

  function confirmDelete() {
    Alert.alert(
      'Delete routine',
      `Remove "${routine.name}"? Your streak data will be lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRoutine(routine.id);
            router.back();
          },
        },
      ],
    );
  }

  const createdDate = new Date(routine.createdAt).toLocaleDateString('en-US', {
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
          onPress={() => router.push({ pathname: '/new-routine', params: { edit: routine.id } } as never)}
          style={styles.editBtn}
        >
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Identity ── */}
        <View style={styles.identity}>
          <View style={[styles.iconBadge, { backgroundColor: routine.color }]}>
            <Ionicons name={routine.icon as never} size={40} color="#fff" />
          </View>
          <Text style={styles.routineName}>{routine.name}</Text>
          <Text style={styles.routineSub}>
            {totalCount} habit{totalCount !== 1 ? 's' : ''}
            {routine.reminderTime
              ? ` · ${formatTime(routine.reminderTime.hour, routine.reminderTime.minute)}`
              : ''}
          </Text>
        </View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Ionicons name="flame" size={18} color={C.textMuted} style={{ marginBottom: 4 }} />
            <Text style={styles.statValue}>{routine.streak}</Text>
            <Text style={styles.statLabel}>Current streak</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Ionicons name="trophy-outline" size={18} color={C.textMuted} style={{ marginBottom: 4 }} />
            <Text style={styles.statValue}>{routine.bestStreak}</Text>
            <Text style={styles.statLabel}>Best streak</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Ionicons name="calendar-outline" size={18} color={C.textMuted} style={{ marginBottom: 4 }} />
            <Text style={[styles.statValue, { fontSize: 12 }]}>{createdDate}</Text>
            <Text style={styles.statLabel}>Started</Text>
          </View>
        </View>

        {/* ── Today progress card ── */}
        <View style={[styles.progressCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.progressLeft}>
            <Text style={styles.progressTitle}>
              {allDone ? 'Routine complete!' : `${doneCount} of ${totalCount} done today`}
            </Text>
            <Text style={styles.progressSub}>
              {totalCount === 0
                ? 'No habits in this routine'
                : allDone
                  ? 'Great work — streak keeps going!'
                  : `${totalCount - doneCount} habit${totalCount - doneCount !== 1 ? 's' : ''} remaining`}
            </Text>
          </View>
          <View style={[styles.progressRing, { borderColor: allDone ? C.done : routine.color }]}>
            <Text style={[styles.progressRingPct, { color: allDone ? C.done : routine.color }]}>
              {totalCount > 0 ? `${pct}%` : '—'}
            </Text>
          </View>
        </View>

        {/* ── Streak callout ── */}
        {routine.streak > 1 && (
          <View style={[styles.streakCallout, { backgroundColor: C.streakLight }]}>
            <Ionicons name="flame" size={16} color={C.streak} />
            <Text style={[styles.streakCalloutText, { color: C.streak }]}>
              {routine.streak}-day routine streak — keep it up!
            </Text>
          </View>
        )}

        {/* ── All-done banner ── */}
        {allDone && (
          <View style={[styles.completedBanner, { backgroundColor: C.doneLight, borderColor: C.done }]}>
            <Ionicons name="checkmark-circle" size={20} color={C.done} />
            <Text style={[styles.completedText, { color: C.done }]}>All habits done for today!</Text>
          </View>
        )}

        {/* ── Mark all done button ── */}
        {!allDone && totalCount > 0 && (
          <TouchableOpacity
            style={[styles.markAllBtn, { backgroundColor: routine.color }]}
            onPress={handleMarkAllDone}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
            <Text style={styles.markAllText}>Mark all remaining done</Text>
          </TouchableOpacity>
        )}

        {/* ── Habit steps ── */}
        <Text style={styles.sectionLabel}>Habits in this routine</Text>
        <View style={[styles.stepsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          {routineHabits.length === 0 ? (
            <View style={styles.stepsEmpty}>
              <Ionicons name="alert-circle-outline" size={20} color={C.textMuted} />
              <Text style={[styles.stepsEmptyText, { color: C.textMuted }]}>
                The habits in this routine may have been deleted. Edit the routine to update them.
              </Text>
            </View>
          ) : (
            routineHabits.map((habit, index) => {
              const done = isDoneToday(habit);
              return (
                <View
                  key={habit.id}
                  style={[
                    styles.stepRow,
                    index > 0 && { borderTopWidth: 1, borderTopColor: C.border },
                  ]}
                >
                  {/* Step number */}
                  <Text style={[styles.stepNum, { color: done ? C.done : C.textMuted }]}>
                    {index + 1}
                  </Text>

                  {/* Habit icon */}
                  <View style={[
                    styles.stepIcon,
                    { backgroundColor: done ? C.doneLight : habit.color },
                  ]}>
                    {done
                      ? <Ionicons name="checkmark" size={16} color={C.done} />
                      : <Ionicons name={habit.icon as never} size={16} color="#fff" />
                    }
                  </View>

                  {/* Habit name */}
                  <View style={styles.stepBody}>
                    <Text style={[
                      styles.stepName,
                      { color: done ? C.textMuted : C.text },
                      done && styles.stepNameDone,
                    ]}>
                      {habit.name}
                    </Text>
                  </View>

                  {/* Done checkbox */}
                  <TouchableOpacity
                    onPress={() => handleHabitToggle(habit.id)}
                    style={[
                      styles.stepCheckbox,
                      { borderColor: done ? C.done : C.border },
                      done && { backgroundColor: C.done },
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {done && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        {/* ── Actions ── */}
        <Text style={styles.sectionLabel}>Actions</Text>
        <View style={[styles.actionsCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <TouchableOpacity style={styles.actionRow} onPress={confirmDelete} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: C.dangerLight }]}>
              <Ionicons name="trash-outline" size={18} color={C.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: C.danger }]}>Delete Routine</Text>
              <Text style={styles.actionSub}>Permanently remove this routine and its streak</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={C.danger} />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(C: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
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

    identity: { alignItems: 'center', gap: 10, paddingVertical: 8 },
    iconBadge: {
      width: 88, height: 88, borderRadius: 24,
      alignItems: 'center', justifyContent: 'center',
    },
    routineName: { fontSize: 26, fontWeight: '700', color: C.text, textAlign: 'center', letterSpacing: -0.3 },
    routineSub:  { fontSize: 14, color: C.textMuted },

    statsRow: {
      flexDirection: 'row',
      backgroundColor: C.surface,
      borderRadius: 16, borderWidth: 1, borderColor: C.border,
      overflow: 'hidden',
    },
    statBox:     { flex: 1, alignItems: 'center', paddingVertical: 18, paddingHorizontal: 8 },
    statValue:   { fontSize: 16, fontWeight: '700', color: C.text },
    statLabel:   { fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 2 },
    statDivider: { width: 1, backgroundColor: C.border, marginVertical: 12 },

    progressCard: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderRadius: 16, borderWidth: 1, padding: 16, gap: 12,
    },
    progressLeft:    { flex: 1, gap: 4 },
    progressTitle:   { fontSize: 15, fontWeight: '700', color: C.text },
    progressSub:     { fontSize: 12, color: C.textMuted },
    progressRing:    {
      width: 60, height: 60, borderRadius: 30, borderWidth: 4,
      alignItems: 'center', justifyContent: 'center',
    },
    progressRingPct: { fontSize: 13, fontWeight: '800' },

    streakCallout: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderRadius: 10, padding: 14,
    },
    streakCalloutText: { fontSize: 14, fontWeight: '500' },

    completedBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderRadius: 12, padding: 14, borderWidth: 1,
    },
    completedText: { fontSize: 14, fontWeight: '600' },

    markAllBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, borderRadius: 14, paddingVertical: 16,
    },
    markAllText: { fontSize: 15, fontWeight: '600', color: '#fff' },

    sectionLabel: {
      fontSize: 12, fontWeight: '600', color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4,
    },

    stepsCard:       { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
    stepsEmpty:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
    stepsEmptyText:  { flex: 1, fontSize: 13, lineHeight: 18 },

    stepRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 14, paddingVertical: 14,
    },
    stepNum:      { width: 18, fontSize: 13, fontWeight: '700', textAlign: 'center' },
    stepIcon:     { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    stepBody:     { flex: 1 },
    stepName:     { fontSize: 14, fontWeight: '500' },
    stepNameDone: { textDecorationLine: 'line-through' },
    stepCheckbox: {
      width: 28, height: 28, borderRadius: 14, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },

    actionsCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
    actionRow:   {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
    },
    actionIcon:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontSize: 15, fontWeight: '600' },
    actionSub:   { fontSize: 12, color: C.textMuted, marginTop: 1 },

    notFound:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    notFoundText: { fontSize: 16, color: C.textMuted },
    backLink:     { paddingVertical: 10 },
    backLinkText: { fontSize: 15, color: C.tint, fontWeight: '600' },
  });
}
