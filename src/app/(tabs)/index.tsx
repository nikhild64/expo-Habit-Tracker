import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, LayoutChangeEvent, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import type { RenderItemParams } from 'react-native-draggable-flatlist';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti, ContextMenu, ProgressRing } from '@/components/ui';
import type { ContextMenuItem } from '@/components/ui';
import { useGamification } from '@/contexts/GamificationContext';
import { isDoneToday, useHabitsStore } from '@/contexts/HabitsContext';
import { useRoutinesStore } from '@/contexts/RoutinesContext';
import { useColors } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { XP_ALL_DONE_BONUS, XP_COMPLETE_HABIT, XP_STREAK_7 } from '@/lib/gamification/rules';
import { quantProgressToday, timedProgressToday, toDateKey } from '@/lib/habits/streak';
import type { Habit, HabitCategory, TimeOfDay } from '@/lib/habits/types';
import type { Routine } from '@/lib/routines/types';
import { CATEGORY_META } from '@/lib/ui/colors';
import { openSystemSettings } from '@/lib/notifications/setup';
import { a11yLabel } from '@/lib/ui/a11y';
import { SPRINGS } from '@/lib/ui/motion';
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

function currentTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'anytime';
}

const TOD_META: Record<TimeOfDay, { label: string; icon: string; order: number }> = {
  morning:   { label: 'Morning',   icon: 'sunny-outline',          order: 0 },
  afternoon: { label: 'Afternoon', icon: 'partly-sunny-outline',   order: 1 },
  evening:   { label: 'Evening',   icon: 'moon-outline',           order: 2 },
  anytime:   { label: 'Anytime',   icon: 'infinite-outline',       order: 3 },
};

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Per-time-of-day completion bars shown next to the progress ring.
 * Each bar = ratio of habits-done within that section.
 */
function TodayBarBreakdown({ habits, C, accent }: { habits: Habit[]; C: Colors; accent: string }) {
  const sections = useMemo(() => {
    const groups: Record<TimeOfDay, Habit[]> = { morning: [], afternoon: [], evening: [], anytime: [] };
    for (const h of habits) groups[h.timeOfDay ?? 'anytime'].push(h);
    return (['morning', 'afternoon', 'evening', 'anytime'] as TimeOfDay[])
      .filter(t => groups[t].length > 0)
      .map(t => ({
        tod: t,
        total: groups[t].length,
        done: groups[t].filter(isDoneToday).length,
      }));
  }, [habits]);

  if (sections.length === 0) return null;

  return (
    <View style={{ gap: 5 }}>
      {sections.map(sec => {
        const ratio = sec.total > 0 ? sec.done / sec.total : 0;
        const meta = TOD_META[sec.tod];
        return (
          <View key={sec.tod} style={tbb.row}>
            <Ionicons name={meta.icon as never} size={10} color={C.textMuted} />
            <Text style={[tbb.label, { color: C.textMuted }]} numberOfLines={1}>{meta.label}</Text>
            <View style={[tbb.track, { backgroundColor: C.surfaceAlt }]}>
              <View style={[tbb.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: accent }]} />
            </View>
            <Text style={[tbb.count, { color: C.textSecondary }]}>{sec.done}/{sec.total}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Animated streak pill — gentle pulse when a freeze was just consumed (signals
 * "your streak survived"), and a brief glow on 7-day milestones.
 */
function StreakPill({ habit, C }: { habit: Habit; C: Colors }) {
  const done = isDoneToday(habit);
  const yesterday = toDateKey(new Date(Date.now() - 86_400_000));
  const freezeUsed = (habit.freezeUsedDates ?? []).includes(yesterday);
  const hasFreeze  = (habit.freezesAvailable ?? 0) > 0;
  const isMilestone = habit.streak > 0 && habit.streak % 7 === 0;

  const scale = useSharedValue(1);

  useEffect(() => {
    if (freezeUsed && !done) {
      // Pulse twice on freeze use
      scale.value = withSequence(
        withTiming(1.05, { duration: 280 }),
        withTiming(1, { duration: 280 }),
        withTiming(1.04, { duration: 240 }),
        withTiming(1, { duration: 240 }),
      );
    } else if (isMilestone && done) {
      // Subtle bounce on milestone done
      scale.value = withSequence(
        withSpring(1.06, SPRINGS.bounce),
        withSpring(1, SPRINGS.smooth),
      );
    }
  }, [freezeUsed, done, isMilestone, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Reanimated.View style={animStyle}>
      <TouchableOpacity
        style={[
          pill.wrap,
          done     && { backgroundColor: C.done, borderColor: C.done },
          freezeUsed && !done && { borderColor: '#3B82F6' },
          isMilestone && done && pill.milestoneGlow,
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
    </Reanimated.View>
  );
}

/**
 * Renders the right-hand completion control for a habit, varying by type.
 * Each variant exposes the same "tap = primary action" interaction.
 */
function CompletionControl({
  habit, C, done, onPrimary,
}: {
  habit: Habit; C: Colors; done: boolean;
  onPrimary: () => void;
}) {
  if (habit.habitType === 'quantitative') {
    const ratio = quantProgressToday(habit);
    const cur   = (habit.progress ?? {})[toDateKey(new Date())] ?? 0;
    const target = habit.target?.value ?? 1;
    return (
      <TouchableOpacity
        onPress={e => { e.stopPropagation(); onPrimary(); }}
        style={[hrow.qBtn, done && { backgroundColor: C.done, borderColor: C.done }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {done ? (
          <Ionicons name="checkmark" size={16} color="#fff" />
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Text style={[hrow.qNum, { color: habit.color }]}>{cur}</Text>
            <Text style={[hrow.qDen, { color: C.textMuted }]}>/{target}</Text>
          </View>
        )}
        {!done && ratio > 0 && (
          <View style={[hrow.qFill, { backgroundColor: habit.color, height: 32 * ratio }]} pointerEvents="none" />
        )}
      </TouchableOpacity>
    );
  }

  if (habit.habitType === 'timed') {
    const ratio = timedProgressToday(habit);
    const cur = (habit.sessionSeconds ?? {})[toDateKey(new Date())] ?? 0;
    return (
      <TouchableOpacity
        onPress={e => { e.stopPropagation(); onPrimary(); }}
        style={[hrow.qBtn, done && { backgroundColor: C.done, borderColor: C.done }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {done ? (
          <Ionicons name="checkmark" size={16} color="#fff" />
        ) : (
          <Ionicons name="play" size={16} color={habit.color} />
        )}
        {!done && ratio > 0 && (
          <View style={[hrow.qFill, { backgroundColor: habit.color, height: 32 * ratio }]} pointerEvents="none" />
        )}
        {!done && cur > 0 && (
          <Text style={[hrow.qNum, { color: habit.color, fontSize: 9, position: 'absolute', bottom: 1 }]}>
            {Math.round(cur / 60)}m
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  if (habit.habitType === 'negative') {
    return (
      <TouchableOpacity
        onPress={e => { e.stopPropagation(); onPrimary(); }}
        style={[hrow.doneBtn, { borderColor: C.border }, done && { backgroundColor: C.done, borderColor: C.done }]}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      >
        {done && <Ionicons name="shield-checkmark" size={16} color="#fff" />}
        {!done && <Ionicons name="remove-circle-outline" size={16} color={C.textMuted} />}
      </TouchableOpacity>
    );
  }

  // Binary (default)
  return (
    <TouchableOpacity
      onPress={e => { e.stopPropagation(); onPrimary(); }}
      style={[hrow.doneBtn, { borderColor: C.border }, done && { backgroundColor: C.done, borderColor: C.done }]}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
    >
      {done && <Ionicons name="checkmark" size={16} color="#fff" />}
    </TouchableOpacity>
  );
}

function HabitRow({
  habit, C, onPress, onLongPress, onDone, onPin, drag,
}: {
  habit: Habit; C: Colors;
  onPress: () => void;
  onLongPress?: () => void;
  onDone:  () => void;
  onPin:   () => void;
  drag:    () => void;
}) {
  const done = isDoneToday(habit);
  const subtasks = habit.subtasks ?? [];
  const todayKey = toDateKey(new Date());
  const subDone = (habit.subtaskCompletions ?? {})[todayKey] ?? [];

  return (
    <TouchableOpacity
      style={[hrow.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel(habit.name, { done, streak: habit.streak, pinned: habit.pinned })}
      accessibilityHint="Double tap to open details, long press for more actions"
    >
      <View style={[hrow.accent, { backgroundColor: habit.color }]} />
      <View style={[hrow.icon, { backgroundColor: habit.color }]}>
        <Ionicons name={habit.icon as never} size={20} color="#fff" />
      </View>
      <View style={hrow.body}>
        <Text style={[hrow.name, { color: done ? C.textMuted : C.text }]} numberOfLines={1}>
          {habit.name}
        </Text>
        <Text style={[hrow.meta, { color: C.textMuted }]}>
          {formatFreq(habit)}
          {subtasks.length > 0 && ` · ${subDone.length}/${subtasks.length}`}
        </Text>
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
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        accessibilityRole="button"
        accessibilityLabel={habit.pinned ? 'Unpin habit' : 'Pin habit'}
      >
        <Ionicons
          name={habit.pinned ? 'bookmark' : 'bookmark-outline'}
          size={15}
          color={habit.pinned ? C.tint : C.border}
        />
      </TouchableOpacity>

      {/* Type-specific completion control */}
      <CompletionControl habit={habit} C={C} done={done} onPrimary={onDone} />

      {/* Drag handle — long-press to start reorder */}
      <TouchableOpacity
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
          drag();
        }}
        delayLongPress={200}
        style={hrow.iconBtn}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        accessibilityRole="button"
        accessibilityLabel="Long press to reorder"
      >
        <Ionicons name="reorder-three-outline" size={20} color={C.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function SwipeableHabitRow({
  habit, C, onPress, onLongPress, onDone, onPin, onDelete, drag, isActive,
}: {
  habit: Habit; C: Colors;
  onPress:  () => void;
  onLongPress?: () => void;
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
    measuredH.current = e.nativeEvent.layout.height;
  }

  function triggerDelete() {
    if (collapsing) return;
    swipeRef.current?.close();
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
        <HabitRow habit={habit} C={C} onPress={onPress} onLongPress={onLongPress} onDone={onDone} onPin={onPin} drag={drag} />
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

// Time-of-day section header — rendered inline in the FlatList between groups
type ListItem =
  | { kind: 'section'; tod: TimeOfDay; id: string }
  | { kind: 'habit'; habit: Habit; id: string };

function SectionHeader({ tod, C, count, done }: { tod: TimeOfDay; C: Colors; count: number; done: number }) {
  const meta = TOD_META[tod];
  const isCurrent = currentTimeOfDay() === tod;
  return (
    <View style={[todHead.wrap, isCurrent && { backgroundColor: C.tintLight, borderColor: C.tint }]}>
      <View style={[todHead.icon, { backgroundColor: isCurrent ? C.tint : C.surfaceAlt }]}>
        <Ionicons name={meta.icon as never} size={14} color={isCurrent ? '#fff' : C.textSecondary} />
      </View>
      <Text style={[todHead.label, { color: isCurrent ? C.tint : C.textSecondary }]}>{meta.label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={[todHead.count, { color: C.textMuted }]}>{done} / {count}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TodayScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const insets = useSafeAreaInsets();
  // Bottom padding for the note sheet: respect home-indicator / gesture bar
  // (insets.bottom is 0 on devices without one).
  const sheetBottomPad = Math.max(insets.bottom + 12, 24);
  const {
    habits, loading, markDone, incrementProgress, markSlip,
    deleteHabit, reorderHabits, togglePin, addNote, loadFresh,
    archiveHabit, toggleSkipDay,
  } = useHabitsStore();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.selectionAsync().catch(() => null);
    try {
      await loadFresh();
    } finally {
      setRefreshing(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    }
  }, [loadFresh]);
  const { routines, markRoutineCompleteForToday } = useRoutinesStore();
  const { awardXP } = useGamification();
  const toast = useToast();
  const [permDenied, setPermDenied] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<HabitCategory | 'All'>('All');
  const [confettiOn, setConfettiOn] = useState(false);
  // Habits queued for delete — hidden from the list, then committed after the
  // undo window closes. Tracks per-habit timeout id.
  const pendingDeleteRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());

  // ── Note sheet ───────────────────────────────────────────────────────────────
  const [noteSheet, setNoteSheet] = useState<{ habitId: string; date: string } | null>(null);
  const [noteInputText, setNoteInputText] = useState('');

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => setPermDenied(status === 'denied'));
  }, []);

  const activeHabits = useMemo(
    () => habits.filter(h =>
      (h.status ?? 'active') === 'active' && !pendingDeleteIds.has(h.id),
    ),
    [habits, pendingDeleteIds],
  );

  // ── Soft delete with 5s undo ──────────────────────────────────────────────
  const softDelete = useCallback((habitId: string, habitName: string) => {
    // Hide the habit from view immediately.
    setPendingDeleteIds(prev => {
      const next = new Set(prev);
      next.add(habitId);
      return next;
    });
    // Commit the actual delete after the undo window.
    const timer = setTimeout(() => {
      pendingDeleteRef.current.delete(habitId);
      deleteHabit(habitId).catch(() => null);
      setPendingDeleteIds(prev => {
        const next = new Set(prev);
        next.delete(habitId);
        return next;
      });
    }, 5000);
    pendingDeleteRef.current.set(habitId, timer);
    toast.info(`Deleted "${habitName}"`, {
      actionLabel: 'Undo',
      duration: 5000,
      onAction: () => {
        const t = pendingDeleteRef.current.get(habitId);
        if (t) clearTimeout(t);
        pendingDeleteRef.current.delete(habitId);
        setPendingDeleteIds(prev => {
          const next = new Set(prev);
          next.delete(habitId);
          return next;
        });
      },
    });
  }, [deleteHabit, toast]);

  // Clean up any pending timers on unmount.
  useEffect(() => () => {
    pendingDeleteRef.current.forEach(t => clearTimeout(t));
    pendingDeleteRef.current.clear();
  }, []);

  // ── Context menu items factory ────────────────────────────────────────────
  const habitMenuItems = useCallback((h: Habit): ContextMenuItem[] => {
    const todayKey = toDateKey(new Date());
    const isSkipped = (h.skipDays ?? []).includes(todayKey);
    return [
      {
        icon: isDoneToday(h) ? 'arrow-undo-outline' : 'checkmark-circle-outline',
        label: isDoneToday(h) ? 'Unmark today' : 'Mark done',
        onPress: () => { markDone(h.id).catch(() => null); },
      },
      {
        icon: isSkipped ? 'play-circle-outline' : 'pause-circle-outline',
        label: isSkipped ? 'Unskip today' : 'Skip today',
        onPress: () => { toggleSkipDay(h.id, todayKey).catch(() => null); },
      },
      {
        icon: h.pinned ? 'bookmark' : 'bookmark-outline',
        label: h.pinned ? 'Unpin' : 'Pin',
        onPress: () => { togglePin(h.id).catch(() => null); },
      },
      {
        icon: 'stats-chart-outline',
        label: 'View stats',
        onPress: () => router.push({ pathname: '/habit/[id]', params: { id: h.id } }),
      },
      {
        icon: 'create-outline',
        label: 'Edit',
        onPress: () => router.push({ pathname: '/new', params: { edit: h.id } }),
      },
      {
        icon: 'archive-outline',
        label: 'Archive',
        onPress: () => { archiveHabit(h.id).catch(() => null); },
      },
      {
        icon: 'trash-outline',
        label: 'Delete',
        destructive: true,
        onPress: () => softDelete(h.id, h.name),
      },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markDone, toggleSkipDay, togglePin, archiveHabit, softDelete]);

  // ── Completion handler (type-aware) ─────────────────────────────────────────
  const handlePrimary = useCallback(async (habit: Habit) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);

    if (habit.habitType === 'timed') {
      // Navigate to the dedicated timer screen
      router.push({ pathname: '/timer/[id]', params: { id: habit.id } } as never);
      return;
    }

    let result;
    if (habit.habitType === 'quantitative') {
      result = await incrementProgress(habit.id, 1);
    } else if (habit.habitType === 'negative') {
      // For negative habits, the primary action is "I stayed clean" (mark done)
      result = await markDone(habit.id);
    } else {
      result = await markDone(habit.id);
    }
    if (!result.wasAdded) return;

    // "All done today" if every active habit is now completed
    const allDoneNow = activeHabits.every(h =>
      h.id === habit.id ? true : isDoneToday(h),
    );

    for (const routine of routines) {
      const rHabits = routine.habitIds
        .map(rid => activeHabits.find(h => h.id === rid))
        .filter((h): h is Habit => h != null);
      if (rHabits.length > 0) {
        const allRoutineDone = rHabits.every(h =>
          h.id === habit.id ? true : isDoneToday(h),
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
    toast.success(
      allDoneNow ? `All done! +${xpAmount} XP` : `+${xpAmount} XP earned`,
      { duration: 2200 },
    );

    if (allDoneNow) {
      setConfettiOn(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
    }

    const today = toDateKey(new Date());
    const existing = activeHabits.find(h => h.id === habit.id)?.notes?.[today] ?? '';
    setNoteInputText(existing);
    setNoteSheet({ habitId: habit.id, date: today });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markDone, incrementProgress, markSlip, awardXP, activeHabits, routines, markRoutineCompleteForToday, toast]);

  const presentCategories = useMemo(() => {
    const seen = new Set<HabitCategory>();
    activeHabits.forEach(h => seen.add(h.category ?? 'Other'));
    return Array.from(seen);
  }, [activeHabits]);

  const filteredHabits = useMemo(() => {
    return selectedCategory === 'All'
      ? activeHabits
      : activeHabits.filter(h => (h.category ?? 'Other') === selectedCategory);
  }, [activeHabits, selectedCategory]);

  // Build a single list mixing section headers + habits, grouped by time-of-day
  const listItems = useMemo<ListItem[]>(() => {
    const grouped: Record<TimeOfDay, Habit[]> = { morning: [], afternoon: [], evening: [], anytime: [] };
    for (const h of filteredHabits) {
      grouped[h.timeOfDay ?? 'anytime'].push(h);
    }
    // Sort each group by pinned-first then sortOrder
    for (const tod of Object.keys(grouped) as TimeOfDay[]) {
      grouped[tod].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
    }
    const out: ListItem[] = [];
    const order: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];
    for (const tod of order) {
      if (grouped[tod].length === 0) continue;
      out.push({ kind: 'section', tod, id: `sec_${tod}` });
      for (const h of grouped[tod]) {
        out.push({ kind: 'habit', habit: h, id: h.id });
      }
    }
    return out;
  }, [filteredHabits]);

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
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => router.push('/new')}
          accessibilityRole="button"
          accessibilityLabel="Add new habit"
        >
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
            <ProgressRing
              progress={progress}
              size={84}
              stroke={8}
              color={allDone ? C.done : C.tint}
              trackColor={C.surfaceAlt}
              label={`${Math.round(progress * 100)}%`}
            />
            <View style={{ flex: 1, marginLeft: 14, gap: 8 }}>
              <View>
                <Text style={s.progressTitle} numberOfLines={1}>
                  {allDone ? 'All done!' : `${doneCount} of ${total} done`}
                </Text>
                <Text style={s.progressSub}>Today's progress</Text>
              </View>
              <TodayBarBreakdown
                habits={activeHabits}
                C={C}
                accent={allDone ? C.done : C.tint}
              />
            </View>
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

      {presentCategories.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}
        >
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
      <DraggableFlatList<ListItem>
        data={listItems}
        keyExtractor={it => it.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.tint}
            colors={[C.tint]}
          />
        }
        onDragEnd={({ data }) => {
          Haptics.selectionAsync().catch(() => null);
          const orderedHabitIds = data
            .filter((it): it is Extract<ListItem, { kind: 'habit' }> => it.kind === 'habit')
            .map(it => it.habit.id);
          reorderHabits(orderedHabitIds);
        }}
        renderItem={({ item, drag, isActive }: RenderItemParams<ListItem>) => {
          if (item.kind === 'section') {
            const sectionHabits = filteredHabits.filter(h => (h.timeOfDay ?? 'anytime') === item.tod);
            const sectionDone = sectionHabits.filter(isDoneToday).length;
            return (
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
                <SectionHeader tod={item.tod} C={C} count={sectionHabits.length} done={sectionDone} />
              </View>
            );
          }
          const h = item.habit;
          return (
            <ScaleDecorator>
              <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <ContextMenu items={habitMenuItems(h)} disabled={isActive} title={h.name}>
                  <SwipeableHabitRow
                    habit={h} C={C}
                    drag={drag}
                    isActive={isActive}
                    onPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })}
                    onDone={() => handlePrimary(h)}
                    onPin={() => togglePin(h.id)}
                    onDelete={() => softDelete(h.id, h.name)}
                  />
                </ContextMenu>
              </View>
            </ScaleDecorator>
          );
        }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={!loading ? (
          <View style={{ paddingHorizontal: 16 }}>
            <EmptyState C={C} />
          </View>
        ) : null}
        ListFooterComponent={<View style={{ height: 100 }} />}
      />

      <Confetti visible={confettiOn} onDone={() => setConfettiOn(false)} />

      {/*
        Note sheet — keyboard handling:
        On Android, <Modal> creates a separate window that ignores the activity's
        adjustResize, so KeyboardAvoidingView only works if (1) the Modal opts
        into the activity window via `statusBarTranslucent` and (2) the KAV
        wraps the WHOLE overlay with flex:1 so it can absorb the keyboard inset.
        Using behavior="padding" on both platforms is the most reliable combo.
      */}
      <Modal
        visible={noteSheet !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setNoteSheet(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <View style={s.noteOverlay}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setNoteSheet(null)} />
            <View style={[s.noteSheet, { backgroundColor: C.surface, paddingBottom: sheetBottomPad }]}>
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
          </View>
        </KeyboardAvoidingView>
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

    progressCard: { backgroundColor: C.surface, borderRadius: 20, marginHorizontal: 16, marginBottom: 8, padding: 16, gap: 12, borderWidth: 1, borderColor: C.border },
    progressTop: { flexDirection: 'row', alignItems: 'center' },
    progressTitle: { fontSize: 17, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
    progressSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    streakLabel: { fontSize: 11, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },

    listLabel: { fontSize: 13, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, paddingTop: 8, paddingBottom: 4, paddingHorizontal: 16 },

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

    noteOverlay: { flex: 1, backgroundColor: '#00000060' },
    noteSheet: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingTop: 12, paddingHorizontal: 24,
      // paddingBottom set inline via useSafeAreaInsets so the Save button
      // never sits under the home indicator / gesture bar.
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

const pill = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13, fontWeight: '600', maxWidth: 80 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 },
  streakNum: { fontSize: 11, fontWeight: '600' },
  freezeBadge: { flexDirection: 'row', alignItems: 'center', gap: 1, backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  freezeNum: { fontSize: 9, fontWeight: '700', color: '#3B82F6' },
  milestoneGlow: {
    shadowColor: '#FB923C',
    shadowOpacity: 0.65,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});

const tbb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 10, fontWeight: '600', width: 56 },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  count: { fontSize: 10, fontWeight: '700', width: 28, textAlign: 'right' },
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
  qBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', borderColor: 'transparent' },
  qFill: { position: 'absolute', left: 0, right: 0, bottom: 0, opacity: 0.25 },
  qNum: { fontSize: 12, fontWeight: '800', lineHeight: 12 },
  qDen: { fontSize: 8, fontWeight: '600', marginTop: 1 },
});

const todHead = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1, borderColor: 'transparent',
  },
  icon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  count: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
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
