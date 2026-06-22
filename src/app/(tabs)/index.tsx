import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Animated, FlatList, LayoutChangeEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColors } from '@/contexts/ThemeContext';
import { isDoneToday, useHabits } from '@/hooks/use-habits';
import type { Habit } from '@/lib/habits/types';
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
  const f = habit.frequency;
  const period = f.hour >= 12 ? 'PM' : 'AM';
  const h = f.hour % 12 || 12;
  const time = `${h}:${f.minute.toString().padStart(2, '0')} ${period}`;
  if (f.kind === 'daily') return `Daily · ${time}`;
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${f.weekdays.map(d => DAY[d - 1]).join(', ')} · ${time}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StreakPill({ habit, C }: { habit: Habit; C: Colors }) {
  const done = isDoneToday(habit);
  return (
    <TouchableOpacity
      style={[pill.wrap, done && { backgroundColor: C.done, borderColor: C.done }]}
      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
      activeOpacity={0.8}
    >
      <View style={[pill.icon, { backgroundColor: done ? '#fff3' : habit.color }]}>
        <Ionicons name={habit.icon as never} size={14} color="#fff" />
      </View>
      <View>
        <Text style={[pill.name, { color: done ? '#fff' : C.text }]} numberOfLines={1}>{habit.name}</Text>
        <View style={pill.row}>
          <Ionicons name="flame" size={11} color={done ? '#fff9' : C.streak} />
          <Text style={[pill.streakNum, { color: done ? '#fff' : C.streak }]}>{habit.streak}d</Text>
          {done && <Ionicons name="checkmark-circle" size={12} color="#fff" />}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function HabitRow({ habit, C, onPress, onDone }: { habit: Habit; C: Colors; onPress: () => void; onDone: () => void }) {
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
        <Text style={[hrow.name, { color: done ? C.textMuted : C.text }]}>{habit.name}</Text>
        <Text style={[hrow.meta, { color: C.textMuted }]}>{formatFreq(habit)}</Text>
      </View>
      {habit.streak > 0 && (
        <View style={hrow.badge}>
          <Ionicons name="flame" size={12} color={C.streak} />
          <Text style={[hrow.badgeNum, { color: C.streak }]}>{habit.streak}</Text>
        </View>
      )}
      <TouchableOpacity
        onPress={e => { e.stopPropagation(); onDone(); }}
        style={[hrow.doneBtn, { borderColor: C.border }, done && { backgroundColor: C.done, borderColor: C.done }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {done && <Ionicons name="checkmark" size={16} color="#fff" />}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function SwipeableHabitRow({
  habit, C, onPress, onDone, onDelete,
}: {
  habit: Habit; C: Colors;
  onPress: () => void; onDone: () => void; onDelete: () => void;
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
        renderRightActions={renderRightActions}
        friction={2}
        overshootRight={false}
        rightThreshold={40}
      >
        <HabitRow habit={habit} C={C} onPress={onPress} onDone={onDone} />
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
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TodayScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { habits, loading, markDone, deleteHabit, loadFresh } = useHabits();
  const [permDenied, setPermDenied] = useState(false);

  useFocusEffect(useCallback(() => {
    loadFresh();
    Notifications.getPermissionsAsync().then(({ status }) => setPermDenied(status === 'denied'));
  }, []));

  // Re-sync when the app returns to foreground — covers the case where a
  // notification "Done" action writes to AsyncStorage in the background and
  // the Today tab is already focused (so useFocusEffect doesn't re-fire).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') loadFresh();
    });
    return () => sub.remove();
  }, []);

  const doneCount = habits.filter(isDoneToday).length;
  const total = habits.length;
  const progress = total > 0 ? doneCount / total : 0;
  const allDone = total > 0 && doneCount === total;
  const habitsWithStreak = habits.filter(h => h.streak > 0);

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

      {total > 0 && <Text style={s.listLabel}>Habits</Text>}
    </>
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <FlatList
        data={habits}
        keyExtractor={h => h.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: h }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <SwipeableHabitRow
              habit={h} C={C}
              onPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })}
              onDone={() => markDone(h.id)}
              onDelete={() => deleteHabit(h.id)}
            />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={!loading ? (
          <View style={{ paddingHorizontal: 16 }}>
            <EmptyState C={C} />
          </View>
        ) : null}
        ListFooterComponent={<View style={{ height: 24 }} />}
      />
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
  });
}

// Static (non-color) styles for sub-components
const pill = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13, fontWeight: '600', maxWidth: 80 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 },
  streakNum: { fontSize: 11, fontWeight: '600' },
});

const hrow = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 14, gap: 12, overflow: 'hidden' },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  badgeNum: { fontSize: 12, fontWeight: '700' },
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
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
