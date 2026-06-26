/**
 * 6-slide onboarding flow (v2.1 rebuild).
 *
 *   1. Welcome — value prop
 *   2. Never Miss a Day — in-line notification permission button
 *   3. Pick Your Vibe — accent color picker (persists via setAccent)
 *   4. Celebrate Your Streaks — visual feedback for momentum
 *   5. Choose a Starter Pack — link to templates browser
 *   6. Create Your First Habit — single-tap chips that seed a binary habit
 *
 * Slides animate in (slide-up + fade) when they become active. Skip is
 * available on every step except the last; the last slide's CTA is the only
 * way to enter the app from there.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useHabitsStore } from '@/contexts/HabitsContext';
import { useColors, useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { markOnboardingDone } from '@/lib/onboarding';
import { requestNotificationPermission } from '@/lib/notifications/setup';
import { TEMPLATE_BUNDLES } from '@/lib/habits/templates';
import { useReduceMotion } from '@/lib/ui/a11y';
import { SPRINGS, TIMINGS } from '@/lib/ui/motion';
import { ACCENT_PRESETS } from '@/lib/ui/theme';
import type { AccentId } from '@/lib/ui/theme';
import type { Frequency, HabitCategory } from '@/lib/habits/types';
import { HABIT_COLORS, HABIT_ICONS } from '@/lib/ui/colors';

const { width } = Dimensions.get('window');

const SLIDE_BG = {
  intro:     { bg: '#EFF6FF', accent: '#BFDBFE', iconBg: '#2563EB' },
  notify:    { bg: '#FFF7ED', accent: '#FED7AA', iconBg: '#EA580C' },
  accent:    { bg: '#FDF4FF', accent: '#F5D0FE', iconBg: '#A855F7' },
  streaks:   { bg: '#F0FDF4', accent: '#BBF7D0', iconBg: '#16A34A' },
  templates: { bg: '#FFFBEB', accent: '#FDE68A', iconBg: '#D97706' },
  first:     { bg: '#FFE4E6', accent: '#FECDD3', iconBg: '#F43F5E' },
} as const;

type SlideId = keyof typeof SLIDE_BG;

const SLIDES: { id: SlideId; icon: string; title: string; subtitle: string }[] = [
  { id: 'intro',     icon: 'sparkles',          title: 'Build Better\nHabits',         subtitle: 'Small daily actions compound into extraordinary results. Every check-in brings you one step closer.' },
  { id: 'notify',    icon: 'notifications',     title: 'Never Miss\na Day',            subtitle: 'Smart local reminders fire right on time — even when you\'re offline. We never spam you.' },
  { id: 'accent',    icon: 'color-palette',     title: 'Pick Your\nVibe',              subtitle: 'Choose an accent color. You can change it later in Settings or unlock more in the Shop.' },
  { id: 'streaks',   icon: 'flame',             title: 'Celebrate\nYour Streaks',      subtitle: 'Watch your streaks grow day by day. Earned freezes cover the days life gets in the way.' },
  { id: 'templates', icon: 'grid',              title: 'Quick-Start\nTemplates',       subtitle: 'Browse pre-built bundles like Morning Routine, Fitness, or Mindfulness — dozens of expert habits, one tap each.' },
  { id: 'first',     icon: 'rocket',            title: 'Create Your\nFirst Habit',     subtitle: 'Pick one to start. You can always add more, edit, or delete from the app.' },
];

// Quick-add chips on the final slide
const QUICK_HABITS: {
  name: string;
  icon: typeof HABIT_ICONS[number];
  color: typeof HABIT_COLORS[number];
  category: HabitCategory;
}[] = [
  { name: 'Drink Water',     icon: 'water-outline',    color: '#3B82F6', category: 'Health' },
  { name: 'Read 20 Minutes', icon: 'book-outline',     color: '#8B5CF6', category: 'Learning' },
  { name: 'Workout',         icon: 'barbell-outline',  color: '#EF4444', category: 'Health' },
  { name: 'Meditate',        icon: 'leaf-outline',     color: '#16A34A', category: 'Mindfulness' },
  { name: 'Journal',         icon: 'book-outline',     color: '#EC4899', category: 'Mindfulness' },
];

export default function OnboardingScreen() {
  const C = useColors();
  const { accent, setAccent } = useTheme();
  const reduceMotion = useReduceMotion();
  const toast = useToast();
  const { addHabit } = useHabitsStore();

  const [current, setCurrent] = useState(0);
  const [permStatus, setPermStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [seededName, setSeededName] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === 'granted') setPermStatus('granted');
      else if (status === 'denied') setPermStatus('denied');
    });
  }, []);

  function go(idx: number) {
    const target = Math.max(0, Math.min(SLIDES.length - 1, idx));
    scrollRef.current?.scrollTo({ x: target * width, animated: !reduceMotion });
    setCurrent(target);
  }

  async function finish() {
    await markOnboardingDone();
    router.replace('/(tabs)' as never);
  }

  async function handleAllowNotifications() {
    setPermStatus('requesting');
    try {
      const status = await requestNotificationPermission();
      if (status === 'granted') {
        setPermStatus('granted');
        toast.success('Reminders enabled');
      } else {
        setPermStatus('denied');
        toast.info('You can enable later in Settings');
      }
    } catch {
      setPermStatus('denied');
    }
  }

  async function handleQuickAdd(q: (typeof QUICK_HABITS)[number]) {
    const frequency: Frequency = { kind: 'daily', hour: 9, minute: 0 };
    await addHabit({
      name: q.name,
      icon: q.icon,
      color: q.color,
      frequency,
      category: q.category,
      habitType: 'binary',
      timeOfDay: 'morning',
    });
    setSeededName(q.name);
    toast.success(`Added "${q.name}"`);
  }

  const isLast = current === SLIDES.length - 1;
  const slideId = SLIDES[current].id;
  const palette = SLIDE_BG[slideId];

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <SafeAreaView edges={['top']} style={s.skipWrap}>
        {!isLast && (
          <TouchableOpacity onPress={finish} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[s.skip, { color: C.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrent(Math.max(0, Math.min(SLIDES.length - 1, idx)));
        }}
        style={{ flex: 1 }}
      >
        {SLIDES.map((sl, idx) => {
          const p = SLIDE_BG[sl.id];
          return (
            <View key={sl.id} style={[s.slide, { backgroundColor: p.bg }]}>
              <SlidePanel
                active={idx === current}
                slideId={sl.id}
                icon={sl.icon}
                iconBg={p.iconBg}
                ringColor={p.accent}
                reduceMotion={reduceMotion}
                permStatus={permStatus}
                onAllowNotifications={handleAllowNotifications}
                accent={accent}
                setAccent={setAccent}
                onBrowseTemplates={async () => {
                  await markOnboardingDone();
                  router.replace('/(tabs)' as never);
                  router.push('/templates' as never);
                }}
                onQuickAdd={handleQuickAdd}
                seededName={seededName}
              />
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom content */}
      <SafeAreaView edges={['bottom']} style={[s.bottomSheet, { backgroundColor: C.surface }]}>
        <View style={s.bottomContent}>
          <View style={s.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  { backgroundColor: C.border },
                  i === current && [s.dotActive, { backgroundColor: palette.iconBg }],
                ]}
              />
            ))}
          </View>

          <Text style={[s.title, { color: C.text }]}>{SLIDES[current].title}</Text>
          <Text style={[s.subtitle, { color: C.textSecondary }]}>{SLIDES[current].subtitle}</Text>

          <View style={s.btnRow}>
            {current > 0 && (
              <TouchableOpacity
                onPress={() => go(current - 1)}
                style={[s.backBtn, { backgroundColor: C.surfaceAlt }]}
                accessibilityRole="button"
                accessibilityLabel="Previous slide"
              >
                <Ionicons name="arrow-back" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={isLast ? finish : () => go(current + 1)}
              style={[s.nextBtn, { backgroundColor: palette.iconBg }]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={isLast ? 'Finish onboarding' : 'Next slide'}
            >
              <Text style={s.nextBtnText}>
                {isLast ? (seededName ? "Let's go!" : 'Skip for now') : 'Next'}
              </Text>
              {!isLast && <Ionicons name="arrow-forward" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Slide panel ──────────────────────────────────────────────────────────────

function SlidePanel(props: {
  active: boolean;
  slideId: SlideId;
  icon: string;
  iconBg: string;
  ringColor: string;
  reduceMotion: boolean;
  permStatus: 'idle' | 'requesting' | 'granted' | 'denied';
  onAllowNotifications: () => void;
  accent: AccentId;
  setAccent: (id: AccentId) => void;
  onBrowseTemplates: () => void;
  onQuickAdd: (q: (typeof QUICK_HABITS)[number]) => void;
  seededName: string | null;
}) {
  const {
    active, slideId, icon, iconBg, ringColor, reduceMotion,
    permStatus, onAllowNotifications, accent, setAccent,
    onBrowseTemplates, onQuickAdd, seededName,
  } = props;

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (active) {
      if (reduceMotion) {
        opacity.value = 1;
        translateY.value = 0;
      } else {
        opacity.value = withTiming(1, TIMINGS.normal);
        translateY.value = withSpring(0, SPRINGS.smooth);
      }
    } else {
      opacity.value = 0;
      translateY.value = 20;
    }
  }, [active, reduceMotion, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={[ps.area, { backgroundColor: 'transparent' }]}>
      <View style={[ps.ring, ps.ringOuter, { borderColor: ringColor }]} />
      <View style={[ps.ring, ps.ringInner, { borderColor: ringColor }]} />

      <View style={[ps.mainIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as never} size={52} color="#fff" />
      </View>

      <Animated.View style={[ps.content, animStyle]}>
        {slideId === 'notify' && (
          <NotifySlide status={permStatus} onAllow={onAllowNotifications} accent={iconBg} />
        )}
        {slideId === 'accent' && (
          <AccentSlide active={accent} setActive={setAccent} />
        )}
        {slideId === 'templates' && (
          <TemplatesPreview onBrowse={onBrowseTemplates} accent={iconBg} />
        )}
        {slideId === 'first' && (
          <FirstHabitGrid onAdd={onQuickAdd} seededName={seededName} />
        )}
      </Animated.View>
    </View>
  );
}

// ── Per-slide widgets ────────────────────────────────────────────────────────

function NotifySlide({
  status, onAllow, accent,
}: {
  status: 'idle' | 'requesting' | 'granted' | 'denied';
  onAllow: () => void;
  accent: string;
}) {
  const C = useColors();
  if (status === 'granted') {
    return (
      <View style={[ps.statusCard, { borderColor: '#16A34A', backgroundColor: '#F0FDF4' }]}>
        <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
        <Text style={[ps.statusText, { color: '#15803D' }]}>Reminders enabled</Text>
      </View>
    );
  }
  if (status === 'denied') {
    return (
      <View style={[ps.statusCard, { borderColor: C.border, backgroundColor: C.surface }]}>
        <Ionicons name="information-circle" size={22} color={C.textSecondary} />
        <Text style={[ps.statusText, { color: C.textSecondary, flex: 1 }]}>
          You can enable later in Settings
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onAllow}
      disabled={status === 'requesting'}
      style={[ps.allowBtn, { backgroundColor: accent, opacity: status === 'requesting' ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel="Allow notifications"
    >
      <Ionicons name="notifications" size={18} color="#fff" />
      <Text style={ps.allowBtnText}>
        {status === 'requesting' ? 'Requesting…' : 'Allow Notifications'}
      </Text>
    </Pressable>
  );
}

function AccentSlide({
  active, setActive,
}: {
  active: AccentId;
  setActive: (id: AccentId) => void;
}) {
  // Show only the free accent presets here so users don't see locked ones during onboarding.
  const presets = ACCENT_PRESETS.filter(a => a.free);
  return (
    <View style={ps.accentRow}>
      {presets.map(p => {
        const isActive = active === p.id;
        return (
          <Pressable
            key={p.id}
            onPress={() => setActive(p.id as AccentId)}
            style={{ alignItems: 'center', gap: 6 }}
            accessibilityRole="button"
            accessibilityLabel={`${p.label} accent`}
          >
            <View
              style={{
                width: 56, height: 56, borderRadius: 28,
                backgroundColor: p.tint,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: isActive ? 4 : 0,
                borderColor: '#0F172A',
                shadowColor: '#000', shadowOpacity: 0.18,
                shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              }}
            >
              {isActive && <Ionicons name="checkmark" size={22} color="#fff" />}
            </View>
            <Text style={ps.accentLabel}>{p.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TemplatesPreview({ onBrowse, accent }: { onBrowse: () => void; accent: string }) {
  const packs = TEMPLATE_BUNDLES.slice(0, 3);
  return (
    <View style={{ gap: 10, width: '100%' }}>
      {packs.map((b, i) => (
        <View key={b.id} style={[ps.tplCard, i > 0 && { opacity: 1 - i * 0.15 }]}>
          <View style={[ps.tplIcon, { backgroundColor: b.color + '22' }]}>
            <Ionicons name={b.icon as never} size={18} color={b.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ps.tplName}>{b.label}</Text>
            <Text style={ps.tplDesc} numberOfLines={1}>{b.description}</Text>
          </View>
        </View>
      ))}
      <Pressable
        onPress={onBrowse}
        style={[ps.browseBtn, { backgroundColor: accent }]}
        accessibilityRole="button"
        accessibilityLabel="Browse all templates"
      >
        <Ionicons name="grid" size={16} color="#fff" />
        <Text style={ps.browseBtnText}>Browse All Templates</Text>
      </Pressable>
    </View>
  );
}

function FirstHabitGrid({
  onAdd, seededName,
}: {
  onAdd: (q: (typeof QUICK_HABITS)[number]) => void;
  seededName: string | null;
}) {
  return (
    <View style={ps.firstGrid}>
      {QUICK_HABITS.map(q => {
        const added = seededName === q.name;
        return (
          <Pressable
            key={q.name}
            onPress={() => onAdd(q)}
            disabled={added}
            style={[
              ps.firstChip,
              { backgroundColor: added ? '#16A34A' : '#fff', borderColor: added ? '#16A34A' : '#E5E7EB' },
            ]}
            accessibilityRole="button"
            accessibilityLabel={added ? `${q.name} added` : `Add ${q.name}`}
          >
            <View style={[ps.firstChipIcon, { backgroundColor: added ? '#fff3' : q.color }]}>
              <Ionicons name={(added ? 'checkmark' : q.icon) as never} size={16} color="#fff" />
            </View>
            <Text style={[ps.firstChipText, { color: added ? '#fff' : '#0F172A' }]}>
              {q.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  skipWrap: { position: 'absolute', top: 0, right: 0, zIndex: 10, padding: 16 },
  skip: { fontSize: 14, fontWeight: '600' },

  slide: { width, flex: 1 },

  bottomSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  bottomContent: { padding: 28, paddingTop: 24, gap: 14 },

  dots: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 24, height: 8, borderRadius: 4 },

  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: -2 },

  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
  },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

const ps = StyleSheet.create({
  area: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 28,
  },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5 },
  ringOuter: { width: 260, height: 260, opacity: 0.4, top: 80 },
  ringInner: { width: 180, height: 180, opacity: 0.6, top: 120 },
  mainIcon: {
    width: 100, height: 100, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  content: { width: '100%', alignItems: 'center', gap: 12 },

  // Notify slide
  allowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 22, paddingVertical: 13,
    borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.15,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  allowBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 14, borderWidth: 1,
  },
  statusText: { fontSize: 14, fontWeight: '600' },

  // Accent slide
  accentRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  accentLabel: { fontSize: 11, fontWeight: '600', color: '#0F172A' },

  // Templates preview
  tplCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  tplIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tplName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  tplDesc: { fontSize: 11, color: '#64748B', marginTop: 1 },
  browseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12, marginTop: 6,
  },
  browseBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // First habit
  firstGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  firstChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 9,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  firstChipIcon: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  firstChipText: { fontSize: 13, fontWeight: '700' },
});
