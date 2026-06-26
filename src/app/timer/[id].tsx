import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as KeepAwake from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ProgressRing } from '@/components/ui';
import { useHabitsStore } from '@/contexts/HabitsContext';
import { useColors } from '@/contexts/ThemeContext';
import { timedProgressToday, toDateKey } from '@/lib/habits/streak';
import type { Colors } from '@/lib/ui/theme';

function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Mode = 'work' | 'shortBreak' | 'longBreak';

const SHORT_BREAK = 5 * 60;
const LONG_BREAK  = 15 * 60;
/** Number of work sessions before a long break. */
const POMO_CYCLE = 4;

export default function TimerScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { habits, addTimerSeconds } = useHabitsStore();

  const habit = habits.find(h => h.id === id);
  const target = habit?.target?.timerSeconds ?? 25 * 60;

  // Today's seconds already logged toward target (for the outer progress ring)
  const todayPriorSec = (habit?.sessionSeconds ?? {})[toDateKey(new Date())] ?? 0;

  // Current session state
  const [mode, setMode]               = useState<Mode>('work');
  const [running, setRunning]         = useState(false);
  const [elapsed, setElapsed]         = useState(0); // seconds elapsed in current session
  const [completedPomos, setCompletedPomos] = useState(0);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedRef = useRef(0); // last `elapsed` we credited to addTimerSeconds

  const sessionTarget = mode === 'work'
    ? target
    : mode === 'shortBreak' ? SHORT_BREAK : LONG_BREAK;

  // ── Tick ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    KeepAwake.activateKeepAwakeAsync('habit-timer').catch(() => null);
    tickRef.current = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      KeepAwake.deactivateKeepAwake('habit-timer').catch(() => null);
    };
  }, [running]);

  // Persist work-session progress periodically (every 10s) so a crash doesn't lose it
  useEffect(() => {
    if (!habit || mode !== 'work') return;
    if (elapsed - lastSavedRef.current >= 10) {
      const delta = elapsed - lastSavedRef.current;
      lastSavedRef.current = elapsed;
      addTimerSeconds(habit.id, delta).catch(console.error);
    }
  }, [elapsed, habit, mode, addTimerSeconds]);

  // Save remaining progress when leaving the screen
  useEffect(() => {
    return () => {
      if (habit && mode === 'work' && elapsed > lastSavedRef.current) {
        const delta = elapsed - lastSavedRef.current;
        addTimerSeconds(habit.id, delta).catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause on background, resume on foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' && running) {
        // Persist current progress
        if (habit && mode === 'work' && elapsed > lastSavedRef.current) {
          const delta = elapsed - lastSavedRef.current;
          lastSavedRef.current = elapsed;
          addTimerSeconds(habit.id, delta).catch(console.error);
        }
      }
    });
    return () => sub.remove();
  }, [running, habit, mode, elapsed, addTimerSeconds]);

  // Session complete?
  useEffect(() => {
    if (!running) return;
    if (elapsed >= sessionTarget) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      setRunning(false);
      if (mode === 'work') {
        // Persist any leftover seconds first
        if (habit && elapsed > lastSavedRef.current) {
          const delta = elapsed - lastSavedRef.current;
          lastSavedRef.current = elapsed;
          addTimerSeconds(habit.id, delta).catch(console.error);
        }
        const newCount = completedPomos + 1;
        setCompletedPomos(newCount);
        // Cycle into break
        setMode(newCount % POMO_CYCLE === 0 ? 'longBreak' : 'shortBreak');
        setElapsed(0);
        lastSavedRef.current = 0;
      } else {
        // Break done — back to work
        setMode('work');
        setElapsed(0);
        lastSavedRef.current = 0;
      }
    }
  }, [elapsed, sessionTarget, running, mode, completedPomos, habit, addTimerSeconds]);

  if (!habit) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.notFound}>
          <Text style={[s.title, { color: C.text }]}>Habit not found</Text>
          <Button label="Go back" onPress={() => router.back()} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  const remaining = Math.max(0, sessionTarget - elapsed);
  const sessionProgress = elapsed / sessionTarget;
  const todayProgress = timedProgressToday(habit);
  const totalTodaySec = todayPriorSec + (mode === 'work' ? elapsed - lastSavedRef.current : 0);

  function toggle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    setRunning(r => !r);
  }

  function reset() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    setRunning(false);
    setElapsed(0);
    lastSavedRef.current = 0;
  }

  const accent = habit.color;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-down" size={28} color={C.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.modeLabel, { color: C.textMuted }]}>
            {mode === 'work' ? 'Focus' : mode === 'shortBreak' ? 'Short break' : 'Long break'}
          </Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <View style={s.body}>
        <Text style={[s.habitName, { color: C.text }]}>{habit.name}</Text>
        <Text style={[s.cycleLabel, { color: C.textMuted }]}>
          Session {completedPomos + 1}{habit.target?.timerSeconds ? ` · ${Math.round(habit.target.timerSeconds / 60)} min` : ''}
        </Text>

        <View style={{ marginVertical: 32 }}>
          <ProgressRing
            progress={sessionProgress}
            size={260}
            stroke={12}
            color={accent}
            trackColor={C.surfaceAlt}
          />
          <View style={s.ringInner}>
            <Text style={[s.timeMain, { color: C.text }]}>{formatMMSS(remaining)}</Text>
            <Text style={[s.timeSub, { color: C.textMuted }]}>remaining</Text>
          </View>
        </View>

        <View style={s.controls}>
          <Pressable onPress={reset} style={[s.iconBtnLg, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Ionicons name="refresh" size={22} color={C.textSecondary} />
          </Pressable>
          <Pressable
            onPress={toggle}
            style={[s.playBtn, { backgroundColor: accent }]}
          >
            <Ionicons name={running ? 'pause' : 'play'} size={38} color="#fff" style={!running ? { marginLeft: 4 } : undefined} />
          </Pressable>
          <Pressable
            onPress={() => {
              setMode(mode === 'work' ? 'shortBreak' : 'work');
              setElapsed(0);
              lastSavedRef.current = 0;
            }}
            style={[s.iconBtnLg, { backgroundColor: C.surface, borderColor: C.border }]}
          >
            <Ionicons name="play-skip-forward" size={20} color={C.textSecondary} />
          </Pressable>
        </View>

        <View style={[s.todayCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={s.todayRow}>
            <Text style={[s.todayLabel, { color: C.textMuted }]}>Today</Text>
            <Text style={[s.todayValue, { color: C.text }]}>
              {Math.round(totalTodaySec / 60)} / {Math.round((habit.target?.timerSeconds ?? 60) / 60)} min
            </Text>
          </View>
          <View style={[s.todayTrack, { backgroundColor: C.border }]}>
            <View style={[s.todayFill, { width: `${Math.round(todayProgress * 100)}%`, backgroundColor: accent }]} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(C: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    modeLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
    body: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 12 },
    habitName: { fontSize: 26, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
    cycleLabel: { fontSize: 13, marginTop: 4 },
    ringInner: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
    timeMain: { fontSize: 64, fontWeight: '800', letterSpacing: -3, fontVariant: ['tabular-nums'] },
    timeSub:  { fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
    controls: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 8 },
    playBtn:  { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
    iconBtnLg: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    todayCard: { alignSelf: 'stretch', borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 36, gap: 8 },
    todayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    todayLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
    todayValue: { fontSize: 15, fontWeight: '700' },
    todayTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
    todayFill:  { height: 6, borderRadius: 3 },
    notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
    title: { fontSize: 17, fontWeight: '700' },
  });
}
