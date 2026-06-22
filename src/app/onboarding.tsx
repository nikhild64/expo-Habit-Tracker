import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColors } from '@/contexts/ThemeContext';
import { markOnboardingDone } from '@/lib/onboarding';

const { width } = Dimensions.get('window');

// ── Slide data ────────────────────────────────────────────────────────────────

const slides = [
  {
    id: 0,
    bg: '#EFF6FF',
    accent: '#BFDBFE',
    iconBg: '#2563EB',
    icon: 'checkmark-circle' as const,
    title: 'Build Better\nHabits',
    subtitle:
      'Small daily actions compound into extraordinary results. Every check-in brings you one step closer.',
    illustration: 'habits',
  },
  {
    id: 1,
    bg: '#FFF7ED',
    accent: '#FED7AA',
    iconBg: '#EA580C',
    icon: 'notifications' as const,
    title: 'Never Miss\na Day',
    subtitle:
      'Smart local reminders fire right on time, even without internet. Daily server nudges keep your momentum alive.',
    illustration: 'reminders',
  },
  {
    id: 2,
    bg: '#F0FDF4',
    accent: '#BBF7D0',
    iconBg: '#16A34A',
    icon: 'flame' as const,
    title: 'Celebrate\nYour Streaks',
    subtitle:
      'Watch your streaks grow day by day. Visualise your progress and stay unstoppable.',
    illustration: 'streaks',
  },
] as const;

// ── Illustrations ─────────────────────────────────────────────────────────────

function HabitsIllustration() {
  const habits = [
    { icon: 'water-outline', color: '#3B82F6', label: 'Drink Water', done: true },
    { icon: 'code-outline', color: '#8B5CF6', label: 'Code 1 Hour', done: true },
    { icon: 'book-outline', color: '#EC4899', label: 'Read', done: false },
  ] as const;
  return (
    <View style={il.habitsCard}>
      {habits.map((h, i) => (
        <View key={i} style={[il.habitRow, i < habits.length - 1 && il.habitRowBorder]}>
          <View style={[il.habitIcon, { backgroundColor: h.color }]}>
            <Ionicons name={h.icon} size={16} color="#fff" />
          </View>
          <Text style={il.habitLabel}>{h.label}</Text>
          <View style={[il.check, h.done && il.checkDone]}>
            {h.done && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
        </View>
      ))}
    </View>
  );
}

function RemindersIllustration() {
  return (
    <View style={il.notifWrap}>
      {/* Clock */}
      <View style={il.clockChip}>
        <Ionicons name="time-outline" size={14} color="#EA580C" />
        <Text style={il.clockText}>8:00 AM</Text>
      </View>
      {/* Notification card */}
      <View style={il.notifCard}>
        <View style={[il.notifIcon, { backgroundColor: '#EA580C' }]}>
          <Ionicons name="water-outline" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={il.notifTitle}>Drink Water</Text>
          <Text style={il.notifBody}>Time to build your streak!</Text>
        </View>
        <Ionicons name="notifications" size={16} color="#EA580C" />
      </View>
      {/* Second card, offset */}
      <View style={[il.notifCard, il.notifCard2]}>
        <View style={[il.notifIcon, { backgroundColor: '#8B5CF6' }]}>
          <Ionicons name="barbell-outline" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={il.notifTitle}>Workout</Text>
          <Text style={il.notifBody}>Keep the streak going!</Text>
        </View>
        <Ionicons name="notifications" size={16} color="#8B5CF6" />
      </View>
    </View>
  );
}

function StreaksIllustration() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const done = [true, true, true, true, true, false, false];
  return (
    <View style={il.streakWrap}>
      <View style={il.streakBadge}>
        <Ionicons name="flame" size={40} color="#EA580C" />
        <Text style={il.streakNum}>12</Text>
        <Text style={il.streakLabel}>day streak</Text>
      </View>
      <View style={il.calRow}>
        {days.map((d, i) => (
          <View key={i} style={[il.calCell, done[i] && il.calCellDone]}>
            <Text style={[il.calDay, done[i] && il.calDayDone]}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={il.streakStats}>
        <View style={il.statItem}>
          <Text style={il.statNum}>5</Text>
          <Text style={il.statLbl}>Habits</Text>
        </View>
        <View style={[il.statItem, { borderLeftWidth: 1, borderLeftColor: '#D1FAE5' }]}>
          <Text style={il.statNum}>89%</Text>
          <Text style={il.statLbl}>This week</Text>
        </View>
        <View style={[il.statItem, { borderLeftWidth: 1, borderLeftColor: '#D1FAE5' }]}>
          <Text style={il.statNum}>21</Text>
          <Text style={il.statLbl}>Best streak</Text>
        </View>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const C = useColors();
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = current === slides.length - 1;

  function next() {
    if (isLast) {
      finish();
    } else {
      const nextIdx = current + 1;
      scrollRef.current?.scrollTo({ x: nextIdx * width, animated: true });
      setCurrent(nextIdx);
    }
  }

  async function finish() {
    await markOnboardingDone();
    router.replace('/(tabs)' as never);
  }

  const slide = slides[current];

  return (
    <View style={{ flex: 1, backgroundColor: slide.bg }}>
      {/* Skip button */}
      <SafeAreaView edges={['top']} style={s.skipWrap}>
        {!isLast && (
          <TouchableOpacity onPress={finish} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[s.skip, { color: C.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrent(Math.max(0, Math.min(slides.length - 1, idx)));
        }}
        style={{ flex: 1 }}
      >
        {slides.map(sl => (
          <View key={sl.id} style={[s.slide, { backgroundColor: sl.bg }]}>
            {/* Illustration area */}
            <View style={[s.illustrationArea, { backgroundColor: sl.bg }]}>
              {/* Decorative rings */}
              <View style={[s.ring, s.ringOuter, { borderColor: sl.accent }]} />
              <View style={[s.ring, s.ringInner, { borderColor: sl.accent }]} />

              {/* Main icon */}
              <View style={[s.mainIconBg, { backgroundColor: sl.iconBg }]}>
                <Ionicons name={sl.icon} size={52} color="#fff" />
              </View>

              {/* Slide-specific illustration */}
              <View style={s.illustrationContent}>
                {sl.illustration === 'habits' && <HabitsIllustration />}
                {sl.illustration === 'reminders' && <RemindersIllustration />}
                {sl.illustration === 'streaks' && <StreaksIllustration />}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom content */}
      <SafeAreaView edges={['bottom']} style={[s.bottomSheet, { backgroundColor: C.surface }]}>
        <View style={s.bottomContent}>
          {/* Dots */}
          <View style={s.dots}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  { backgroundColor: C.border },
                  i === current && [s.dotActive, { backgroundColor: slide.iconBg }],
                ]}
              />
            ))}
          </View>

          <Text style={[s.title, { color: C.text }]}>{slide.title}</Text>
          <Text style={[s.subtitle, { color: C.textSecondary }]}>{slide.subtitle}</Text>

          {/* Buttons */}
          <View style={s.btnRow}>
            {current > 0 && (
              <TouchableOpacity
                onPress={() => {
                  const prev = current - 1;
                  scrollRef.current?.scrollTo({ x: prev * width, animated: true });
                  setCurrent(prev);
                }}
                style={[s.backBtn, { backgroundColor: C.surfaceAlt }]}
              >
                <Ionicons name="arrow-back" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={next}
              style={[s.nextBtn, { backgroundColor: slide.iconBg }]}
              activeOpacity={0.85}
            >
              <Text style={s.nextBtnText}>{isLast ? 'Get Started' : 'Next'}</Text>
              {!isLast && <Ionicons name="arrow-forward" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  skipWrap: { position: 'absolute', top: 0, right: 0, zIndex: 10, padding: 16 },
  skip: { fontSize: 14, fontWeight: '600', color: '#64748B' },

  slide: { width, flex: 1 },

  illustrationArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    position: 'relative',
  },

  // Decorative rings behind the icon
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5 },
  ringOuter: { width: 260, height: 260, opacity: 0.4 },
  ringInner: { width: 180, height: 180, opacity: 0.6 },

  mainIconBg: {
    width: 100,
    height: 100,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  illustrationContent: { width: '85%', alignItems: 'center' },

  bottomSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  bottomContent: { padding: 28, paddingTop: 24, gap: 16 },

  dots: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0' },
  dotActive: { width: 24, height: 8, borderRadius: 4 },

  title: { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5, lineHeight: 36 },
  subtitle: { fontSize: 15, color: '#64748B', lineHeight: 23, marginTop: -4 },

  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#F4F4F5',
    alignItems: 'center', justifyContent: 'center',
  },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
  },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

// ── Illustration styles ───────────────────────────────────────────────────────

const il = StyleSheet.create({
  // Habits
  habitsCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 4,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  habitRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F4F4F5' },
  habitIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  habitLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0F172A' },
  check: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  checkDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },

  // Reminders
  notifWrap: { width: '100%', gap: 10 },
  clockChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  clockText: { fontSize: 13, fontWeight: '700', color: '#EA580C' },
  notifCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  notifCard2: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  notifIcon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  notifTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  notifBody: { fontSize: 12, color: '#64748B', marginTop: 2 },

  // Streaks
  streakWrap: { width: '100%', gap: 16 },
  streakBadge: {
    alignSelf: 'center', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 24, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
    gap: 2,
  },
  streakNum: { fontSize: 36, fontWeight: '900', color: '#0F172A', lineHeight: 40 },
  streakLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },

  calRow: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  calCell: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  calCellDone: { backgroundColor: '#16A34A' },
  calDay: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  calDayDone: { color: '#fff' },

  streakStats: {
    flexDirection: 'row',
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
    overflow: 'hidden',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statNum: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  statLbl: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
});
