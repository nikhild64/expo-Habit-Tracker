import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, LayoutChangeEvent, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import type { RenderItemParams } from 'react-native-draggable-flatlist';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGamification } from '@/contexts/GamificationContext';
import { isDoneToday, useHabitsStore } from '@/contexts/HabitsContext';
import { useRoutinesStore } from '@/contexts/RoutinesContext';
import { useColors } from '@/contexts/ThemeContext';
import { XP_ALL_DONE_BONUS, XP_COMPLETE_HABIT, XP_STREAK_7 } from '@/lib/gamification/rules';
import { toDateKey } from '@/lib/habits/streak';
import type { Habit, HabitCategory } from '@/lib/habits/types';
import type { Routine } from '@/lib/routines/types';
import { CATEGORY_META } from '@/lib/ui/colors';
import { openSystemSettings } from '@/lib/notifications/setup';
import type { Colors } from '@/lib/ui/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function dateLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatFreq(habit: Habit): string {
  const f      = habit.frequency;
  const period = f.hour >= 12 ? 'PM' : 'AM';
  const h      = f.hour % 12 || 12;
  const time   = `${h}:${f.minute.toString().padStart(2, '0')} ${period}`;
  const DAY    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (f.kind) {
    case 'daily':    return `Daily · ${time}`;
    case 'weekly':   return `${f.weekdays.map(d => DAY[d - 1]).join(', ')} · ${time}`;
    case 'weekdays': return `Mon–Fri · ${time}`;
    case 'weekends': return `Sat–Sun · ${time}`;
    case 'xperweek': return `${f.count}× per week · ${time}`;
    case 'interval': return `Every ${f.days} days · ${time}`;
    default:         return time;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StreakPill({ habit, C }: { habit: Habit; C: Colors }) {
  const done = isDoneToday(habit);
  const yesterday = toDateKey(new Date(Date.now() - 86_400_000));
  const freezeUsed = (habit.freezeUsedDates ?? []).includes(yesterday);
  const hasFreeze  = (habit.freezesAvailable ?? 0) > 0;

  return (
    <TouchableOpacity
      style={[
        pill.wrap,
        done     && { backgroundColor: C.done, borderColor: C.done },
        freezeUsed && !done && { borderColor: '#3B82F6' },
      ]}
      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
      activeOpacity={0.8}
    >
      <View style={[pill.icon, { backgroundColor: done ? '#fff3' : habit.color }]}>
        <Ionicons name={habit.icon as never} size={14} color="#fff" />
      </View>
      <View>
        <Text style={[pill.name, { color: done ? '#fff' : C.text }]} numberOfLines={1}>{habit.name}</Text>
        <View style={pill.row}>
          {freezeUsed && !done
            ? <Ionicons name="snow-outline" size={11} color="#3B82F6" />
            : <Ionicons name="flame" size={11} color={done ? '#fff9' : C.streak} />
          }
          <Text style={[pill.streakNum, { color: done ? '#fff' : freezeUsed ? '#3B82F6' : C.streak }]}>
            {habit.streak}d
          </Text>
          {done     && <Ionicons name="checkmark-circle"  size={12} color="#fff" />}
          {!done && hasFreeze && !freezeUsed && (
            <View style={pill.freezeBadge}>
              <Ionicons name="snow-outline" size={9} color="#3B82F6" />
              <Text style={pill.freezeNum}>{habit.freezesAvailable}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function HabitRow({
  habit, C, onPress, onDone, onPin, drag,
}: {
  habit: Habit; C: Colors;
  onPress: () => void;
  onDone:  () => void;
  onPin:   () => void;
  drag:    () => void;
}) {
  const done = isDoneToday(habit);
  return (
    <TouchableOpacity
      style={[hrow.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[hrow.accent, { backgroundColor: habit.color }]} />
      <View style={[hrow.icon, { backgroundColor: habit.color }]}>
        <Ionicons name={habit.icon as never} size={20} color="#fff" />
      </View>
      <View style={hrow.body}>
        <Text style={[hrow.name, { color: done ? C.textMuted : C.text }]} numberOfLines={1}>
          {habit.name}
        </Text>
        <Text style={[hrow.meta, { color: C.textMuted }]}>{formatFreq(habit)}</Text>
      </View>
      {habit.streak > 0 && (
        <View style={hrow.badge}>
          <Ionicons name="flame" size={12} color={C.streak} />
          <Text style={[hrow.badgeNum, { color: C.streak }]}>{habit.streak}</Text>
        </View>
      )}

      {/* Pin toggle */}
      <TouchableOpacity
        onPress={e => { e.stopPropagation(); onPin(); }}
        style={hrow.iconBtn}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      >
        <Ionicons
          name={habit.pinned ? 'bookmark' : 'bookmark-outline'}
          size={15}
          color={habit.pinned ? C.tint : C.border}
        />
      </TouchableOpacity>

      {/* Done checkbox */}
      <TouchableOpacity
        onPress={e => { e.stopPropagation(); onDone(); }}
        style={[hrow.doneBtn, { borderColor: C.border }, done && { backgroundColor: C.done, borderColor: C.done }]}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      >
        {done && <Ionicons name="checkmark" size={16} color="#fff" />}
      </TouchableOpacity>

      {/* Drag handle — long-press to start reorder */}
      <TouchableOpacity
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
          drag();
        }}
        delayLongPress={200}
        style={hrow.iconBtn}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      >
        <Ionicons name="reorder-three-outline" size={20} color={C.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function SwipeableHabitRow({
  habit, C, onPress, onDone, onPin, onDelete, drag, isActive,
}: {
  habit: Habit; C: Colors;
  onPress:  () => void;
  onDone:   () => void;
  onPin:    () => void;
  onDelete: () => void;
  drag:     () => void;
  isActive: boolean;
}) {
  const swipeRef = useRef<any>(null);
  const measuredH = useRef(0);
  const rowH    = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [collapsing, setCollapsing] = useState(false);

  function captureHeight(e: LayoutChangeEvent) {
    // Only capture once; re-measure is fine too since setValue is cheap.
    measuredH.current = e.nativeEvent.layout.height;
  }

  function triggerDelete() {
    // Guard against double-fires (button tap + auto-open race).
    if (collapsing) return;
    swipeRef.current?.close();
    // Pin the animated value at the measured row height, then animate to 0.
    rowH.setValue(measuredH.current);
    setCollapsing(true);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(rowH,   { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start(onDelete);
  }

  function renderRightActions(progress: Animated.AnimatedInterpolation<number>) {
    const translateX = progress.interpolate({
      inputRange: [0, 1], outputRange: [96, 0], extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[swr.actionWrap, { transform: [{ translateX }] }]}>
        <TouchableOpacity onPress={triggerDelete} style={swr.deleteBtn} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={swr.deleteTxt}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      onLayout={captureHeight}
      style={collapsing
        ? { height: rowH, opacity: fadeAnim, overflow: 'hidden' }
        : { opacity: fadeAnim }
      }
    >
      <Swipeable
        ref={swipeRef}
        enabled={!isActive}
        renderRightActions={renderRightActions}
        friction={2}
        overshootRight={false}
        rightThreshold={40}
      >
        <HabitRow habit={habit} C={C} onPress={onPress} onDone={onDone} onPin={onPin} drag={drag} />
      </Swipeable>
    </Animated.View>
  );
}

function EmptyState({ C }: { C: Colors }) {
  return (
    <View style={empty.wrap}>
      <View style={[empty.icon, { backgroundColor: C.surfaceAlt }]}>
        <Ionicons name="leaf-outline" size={36} color={C.textMuted} />
      </View>
      <Text style={[empty.title, { color: C.text }]}>No habits yet</Text>
      <Text style={[empty.body, { color: C.textMuted }]}>Tap the + button to create your first habit and start building streaks.</Text>
      <TouchableOpacity style={[empty.btn, { backgroundColor: C.tint }]} onPress={() => router.push('/new')} activeOpacity={0.8}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={empty.btnText}>Create first habit</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[empty.btn, empty.btnSecondary, { backgroundColor: C.surfaceAlt, borderColor: C.border }]} onPress={() => router.push('/templates' as never)} activeOpacity={0.8}>
        <Ionicons name="grid-outline" size={18} color={C.textSecondary} />
        <Text style={[empty.btnText, { color: C.textSecondary }]}>Browse Templates</Text>
      </TouchableOpacity>
    </View>
  );
}

function RoutineCard({ routine, habits, C }: { routine: Routine; habits: Habit[]; C: Colors }) {
  const routineHabits = useMemo(
    () =>
      routine.habitIds
        .map(id => habits.find(h => h.id === id))
        .filter((h): h is Habit => h != null && (h.status ?? 'active') === 'active'),
    [routine.habitIds, habits],
  );
  const doneCount = routineHabits.filter(isDoneToday).length;
  const total     = routineHabits.length;
  const allDone   = total > 0 && doneCount === total;
  const pct       = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <TouchableOpacity
      style={[rcard.card, { backgroundColor: C.surface, borderColor: allDone ? C.done : C.border }]}
      onPress={() => router.push({ pathname: '/routine/[id]', params: { id: routine.id } } as never)}
      activeOpacity={0.8}
    >
      <View style={[rcard.accent, { backgroundColor: routine.color }]} />
      <View style={[rcard.icon, { backgroundColor: allDone ? C.doneLight : routine.color }]}>
        {allDone
          ? <Ionicons name="checkmark" size={20} color={C.done} />
          : <Ionicons name={routine.icon as never} size={20} color="#fff" />
        }
      </View>
      <View style={rcard.body}>
        <Text style={[rcard.name, { color: C.text }]} numberOfLines={1}>{routine.name}</Text>
        <Text style={[rcard.sub, { color: C.textMuted }]}>
          {total === 0 ? 'No active habits' : allDone ? 'All done!' : `${doneCount}/${total} done`}
        </Text>
      </View>
      <View style={[rcard.ring, { borderColor: allDone ? C.done : routine.color }]}>
        <Text style={[rcard.ringText, { color: allDone ? C.done : routine.color }]}>
          {total > 0 ? `${pct}%` : '—'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TodayScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { habits, loading, markDone, deleteHabit, reorderHabits, togglePin, addNote } = useHabitsStore();
  const { routines, markRoutineCompleteForToday } = useRoutinesStore();
  const { awardXP } = useGamification();
  const [permDenied, setPermDenied] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<HabitCategory | 'All'>('All');

  // ── XP Toast ────────────────────────────────────────────────────────────────
  const [xpToastAmount, setXpToastAmount] = useState(0);
  const xpOpacity = useRef(new Animated.Value(0)).current;
  const xpTransY  = useRef(new Animated.Value(0)).current;

  // ── Note sheet ───────────────────────────────────────────────────────────────
  const [noteSheet, setNoteSheet] = useState<{ habitId: string; date: string } | null>(null);
  const [noteInputText, setNoteInputText] = useState('');

  function showXpToast(amount: number) {
    setXpToastAmount(amount);
    xpOpacity.setValue(0);
    xpTransY.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(xpOpacity,  { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(xpTransY,   { toValue: -12, duration: 250, useNativeDriver: true }),
      ]),
      Animated.delay(1000),
      Animated.parallel([
        Animated.timing(xpOpacity,  { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(xpTransY,   { toValue: -32, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => setPermDenied(status === 'denied'));
  }, []);

  // Only active habits appear in the Today tab
  const activeHabits = useMemo(
    () => habits.filter(h => (h.status ?? 'active') === 'active'),
    [habits],
  );

  // ── Completion handler — awards XP, auto-completes routines, shows toast ───
  const handleDone = useCallback(async (habitId: string) => {
    const result = await markDone(habitId);
    if (!result.wasAdded) return;

    // "All done today" if every active habit is now completed
    const allDoneNow = activeHabits.every(h =>
      h.id === habitId ? true : isDoneToday(h),
    );

    // Auto-complete any routines whose habits are now all done
    for (const routine of routines) {
      const rHabits = routine.habitIds
        .map(rid => activeHabits.find(h => h.id === rid))
        .filter((h): h is Habit => h != null);
      if (rHabits.length > 0) {
        const allRoutineDone = rHabits.every(h =>
          h.id === habitId ? true : isDoneToday(h),
        );
        if (allRoutineDone) {
          markRoutineCompleteForToday(routine.id).catch(console.error);
        }
      }
    }

    let xpAmount = XP_COMPLETE_HABIT;
    if (allDoneNow)                                            xpAmount += XP_ALL_DONE_BONUS;
    if (result.newStreak > 0 && result.newStreak % 7 === 0)   xpAmount += XP_STREAK_7;

    await awardXP(xpAmount, { allHabitsDone: allDoneNow }, activeHabits);
    showXpToast(xpAmount);

    // Open the optional note sheet — pre-populate from any existing note for today
    const today = toDateKey(new Date());
    const existing = activeHabits.find(h => h.id === habitId)?.notes?.[today] ?? '';
    setNoteInputText(existing);
    setNoteSheet({ habitId, date: today });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markDone, awardXP, activeHabits, routines, markRoutineCompleteForToday]);

  // Categories that actually have active habits (to avoid showing empty chips)
  const presentCategories = useMemo(() => {
    const seen = new Set<HabitCategory>();
    activeHabits.forEach(h => seen.add(h.category ?? 'Other'));
    return Array.from(seen);
  }, [activeHabits]);

  // Pinned first → sorted by sortOrder, then filtered by selected category
  const sortedHabits = useMemo(() => {
    const filtered = selectedCategory === 'All'
      ? activeHabits
      : activeHabits.filter(h => (h.category ?? 'Other') === selectedCategory);
    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }, [activeHabits, selectedCategory]);

  const doneCount = activeHabits.filter(isDoneToday).length;
  const total = activeHabits.length;
  const progress = total > 0 ? doneCount / total : 0;
  const allDone = total > 0 && doneCount === total;
  const habitsWithStreak = activeHabits.filter(h => h.streak > 0);

  const listHeader = (
    <>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.greeting}>{greeting()}</Text>
          <Text style={s.date}>{dateLabel()}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/new')}>
          <Ionicons name="add" size={22} color={C.tint} />
        </TouchableOpacity>
      </View>

      {permDenied && (
        <TouchableOpacity style={s.permBanner} onPress={openSystemSettings} activeOpacity={0.8}>
          <Ionicons name="notifications-off-outline" size={14} color={C.danger} />
          <Text style={s.permBannerText}>Notifications disabled — tap to enable</Text>
          <Ionicons name="chevron-forward" size={12} color={C.danger} />
        </TouchableOpacity>
      )}

      {total > 0 && (
        <View style={s.progressCard}>
          <View style={s.progressTop}>
            <View>
              <Text style={s.progressTitle}>
                {allDone ? 'All done! Great work.' : `${doneCount} of ${total} completed`}
              </Text>
              <Text style={s.progressSub}>Today's habits</Text>
            </View>
            <View style={[s.progressCircle, { borderColor: allDone ? C.done : C.tint }]}>
              <Text style={[s.progressPct, { color: allDone ? C.done : C.tint }]}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: allDone ? C.done : C.tint }]} />
          </View>
          {habitsWithStreak.length > 0 && (
            <>
              <Text style={s.streakLabel}>Active streaks</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                {habitsWithStreak.map(h => <StreakPill key={h.id} habit={h} C={C} />)}
              </ScrollView>
            </>
          )}
        </View>
      )}

      {/* ── Routines section ─────────────────────────────────────────────── */}
      <View style={s.routinesSection}>
        <View style={s.routinesSectionHeader}>
          <Text style={s.sectionHeaderLabel}>Routines</Text>
          <TouchableOpacity
            onPress={() => router.push('/new-routine' as never)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="add-circle-outline" size={20} color={C.tint} />
          </TouchableOpacity>
        </View>
        {routines.length === 0 ? (
          <TouchableOpacity
            style={[s.routinesEmpty, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => router.push('/new-routine' as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={18} color={C.textMuted} />
            <Text style={[s.routinesEmptyText, { color: C.textMuted }]}>
              Stack habits into a daily routine
            </Text>
            <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 8 }}>
            {routines.map(r => (
              <RoutineCard key={r.id} routine={r} habits={habits} C={C} />
            ))}
          </View>
        )}
      </View>

      {/* Category filter chips — only render when 2+ categories are in use */}
      {presentCategories.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}
        >
          {/* "All" chip */}
          <TouchableOpacity
            style={[s.catChip, selectedCategory === 'All' && { backgroundColor: C.tint, borderColor: C.tint }]}
            onPress={() => setSelectedCategory('All')}
          >
            <Text style={[s.catChipText, { color: selectedCategory === 'All' ? '#fff' : C.textSecondary }]}>
              All
            </Text>
          </TouchableOpacity>
          {presentCategories.map(cat => {
            const meta    = CATEGORY_META[cat];
            const active  = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[s.catChip, active && { backgroundColor: meta.color, borderColor: meta.color }]}
                onPress={() => setSelectedCategory(active ? 'All' : cat)}
              >
                <Ionicons name={meta.icon as never} size={12} color={active ? '#fff' : meta.color} />
                <Text style={[s.catChipText, { color: active ? '#fff' : C.textSecondary }]}>
                  {meta.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {total > 0 && <Text style={s.listLabel}>Habits</Text>}
    </>
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <DraggableFlatList<Habit>
        data={sortedHabits}
        keyExtractor={h => h.id}
        showsVerticalScrollIndicator={false}
        onDragEnd={({ data }) => {
          Haptics.selectionAsync().catch(() => null);
          reorderHabits(data.map(h => h.id));
        }}
        renderItem={({ item: h, drag, isActive }: RenderItemParams<Habit>) => (
          <ScaleDecorator>
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <SwipeableHabitRow
                habit={h} C={C}
                drag={drag}
                isActive={isActive}
                onPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })}
                onDone={() => handleDone(h.id)}
                onPin={() => togglePin(h.id)}
                onDelete={() => deleteHabit(h.id)}
              />
            </View>
          </ScaleDecorator>
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={!loading ? (
          <View style={{ paddingHorizontal: 16 }}>
            <EmptyState C={C} />
          </View>
        ) : null}
        ListFooterComponent={<View style={{ height: 24 }} />}
      />

      {/* ── XP toast overlay ──────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={[
          s.xpToastWrap,
          { opacity: xpOpacity, transform: [{ translateY: xpTransY }] },
        ]}
      >
        <View style={s.xpToast}>
          <Ionicons name="star" size={13} color="#F59E0B" />
          <Text style={s.xpToastText}>+{xpToastAmount} XP</Text>
        </View>
      </Animated.View>

      {/* ── Note sheet modal ──────────────────────────────────────────────── */}
      <Modal
        visible={noteSheet !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setNoteSheet(null)}
      >
        <View style={s.noteOverlay}>
          {/* Backdrop — tap to dismiss */}
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setNoteSheet(null)} />
          {/* Sheet sits below the backdrop; KAV pushes it above the keyboard */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[s.noteSheet, { backgroundColor: C.surface }]}>
              <View style={[s.noteDragHandle, { backgroundColor: C.border }]} />
              <View style={s.noteSheetHeader}>
                <Ionicons name="journal-outline" size={20} color={C.tint} />
                <Text style={[s.noteSheetTitle, { color: C.text }]}>Add a note (optional)</Text>
              </View>
              {noteSheet && (
                <Text style={[s.noteSheetSub, { color: C.textMuted }]}>
                  {habits.find(h => h.id === noteSheet.habitId)?.name ?? ''} · {noteSheet.date}
                </Text>
              )}
              <TextInput
                style={[s.noteInput, { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.text }]}
                placeholder="How did it go? Any thoughts…"
                placeholderTextColor={C.textMuted}
                multiline
                value={noteInputText}
                onChangeText={setNoteInputText}
                autoFocus
                returnKeyType="default"
              />
              <View style={s.noteActions}>
                <TouchableOpacity
                  style={[s.noteSaveBtn, { backgroundColor: C.tint }]}
                  onPress={async () => {
                    if (noteSheet && noteInputText.trim()) {
                      await addNote(noteSheet.habitId, noteSheet.date, noteInputText.trim());
                    }
                    setNoteSheet(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={s.noteSaveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.noteSkipBtn}
                  onPress={() => setNoteSheet(null)}
                >
                  <Text style={[s.noteSkipBtnText, { color: C.textMuted }]}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Style factories ───────────────────────────────────────────────────────────

function createStyles(C: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 12 },
    greeting: { fontSize: 14, color: C.textMuted, fontWeight: '500' },
    date: { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginTop: 2 },
    addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.tintLight, alignItems: 'center', justifyContent: 'center' },

    permBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.dangerLight, marginHorizontal: 16, marginBottom: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
    permBannerText: { flex: 1, fontSize: 12, color: C.danger, fontWeight: '500' },

    progressCard: { backgroundColor: C.surface, borderRadius: 20, marginHorizontal: 16, marginBottom: 8, padding: 18, gap: 12, borderWidth: 1, borderColor: C.border },
    progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    progressTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    progressSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    progressCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
    progressPct: { fontSize: 14, fontWeight: '800' },
    progressTrack: { height: 5, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
    progressFill: { height: 5, borderRadius: 3 },
    streakLabel: { fontSize: 11, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },

    listLabel: { fontSize: 13, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, paddingTop: 8, paddingBottom: 8, paddingHorizontal: 16 },

    xpToastWrap: {
      position: 'absolute', bottom: 96, left: 0, right: 0,
      alignItems: 'center',
    },
    xpToast: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(28,25,23,0.92)',
      borderRadius: 24, paddingHorizontal: 18, paddingVertical: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
    },
    xpToastText: { fontSize: 15, fontWeight: '700', color: '#F59E0B', letterSpacing: 0.5 },

    catChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderRadius: 20, borderWidth: 1.5, borderColor: C.border,
      paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.surface,
    },
    catChipText: { fontSize: 12, fontWeight: '600' },

    routinesSection: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
    routinesSectionHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: 8, paddingBottom: 4,
    },
    sectionHeaderLabel: {
      fontSize: 13, fontWeight: '600', color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.7,
    },
    routinesEmpty: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderRadius: 14, borderWidth: 1, borderStyle: 'dashed',
      paddingHorizontal: 14, paddingVertical: 12,
    },
    routinesEmptyText: { flex: 1, fontSize: 13, fontWeight: '500' },

    // Note sheet
    noteOverlay: { flex: 1, backgroundColor: '#00000060' },
    noteSheet: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingTop: 12, paddingHorizontal: 24, paddingBottom: 40,
      gap: 0,
    },
    noteDragHandle: {
      width: 36, height: 4, borderRadius: 2,
      alignSelf: 'center', marginBottom: 20,
    },
    noteSheetHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
    },
    noteSheetTitle: { fontSize: 17, fontWeight: '700' },
    noteSheetSub: { fontSize: 13, marginBottom: 14 },
    noteInput: {
      borderRadius: 12, borderWidth: 1,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, lineHeight: 22,
      minHeight: 96, textAlignVertical: 'top',
      marginBottom: 18,
    },
    noteActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    noteSaveBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    noteSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    noteSkipBtn: { paddingVertical: 14, paddingHorizontal: 8 },
    noteSkipBtnText: { fontSize: 16, fontWeight: '500' },
  });
}

// Static (non-color) styles for sub-components
const pill = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13, fontWeight: '600', maxWidth: 80 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 },
  streakNum: { fontSize: 11, fontWeight: '600' },
  freezeBadge: { flexDirection: 'row', alignItems: 'center', gap: 1, backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  freezeNum: { fontSize: 9, fontWeight: '700', color: '#3B82F6' },
});

const hrow = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 14, gap: 8, overflow: 'hidden' },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  badgeNum: { fontSize: 12, fontWeight: '700' },
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  doneBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});

const swr = StyleSheet.create({
  actionWrap: { width: 96, paddingLeft: 8, justifyContent: 'center' },
  deleteBtn: {
    flex: 1, backgroundColor: '#EF4444', borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  deleteTxt: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});

const empty = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  icon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 4 },
  btnSecondary: { borderWidth: 1 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});

const rcard = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1, padding: 14, gap: 10, overflow: 'hidden',
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  icon:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body:   { flex: 1, gap: 3 },
  name:   { fontSize: 15, fontWeight: '600' },
  sub:    { fontSize: 12 },
  ring:   {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },
  ringText: { fontSize: 11, fontWeight: '800' },
});
