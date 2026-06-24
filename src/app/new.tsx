import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClockFace } from '@/components/ClockFace';
import { useColors } from '@/contexts/ThemeContext';
import { useHabitsStore } from '@/contexts/HabitsContext';
import type { Frequency, HabitCategory } from '@/lib/habits/types';
import { CATEGORY_META, HABIT_COLORS, HABIT_ICONS } from '@/lib/ui/colors';
import type { Colors } from '@/lib/ui/theme';

const CATEGORIES = Object.keys(CATEGORY_META) as HabitCategory[];

type FreqKind = Frequency['kind'];
const FREQ_OPTIONS: { kind: FreqKind; label: string; icon: string }[] = [
  { kind: 'daily',    label: 'Daily',        icon: 'sunny-outline'     },
  { kind: 'weekdays', label: 'Weekdays',      icon: 'briefcase-outline' },
  { kind: 'weekends', label: 'Weekends',      icon: 'cafe-outline'      },
  { kind: 'weekly',   label: 'Specific days', icon: 'calendar-outline'  },
  { kind: 'xperweek', label: 'X per week',    icon: 'repeat-outline'    },
  { kind: 'interval', label: 'Every N days',  icon: 'timer-outline'     },
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_FULL   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ label, children, C }: { label: string; children: ReactNode; C: Colors }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function NewHabitScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);

  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { habits, addHabit, updateHabit } = useHabitsStore();
  const existing = edit ? habits.find(h => h.id === edit) : undefined;

  const [name, setName]       = useState(existing?.name ?? '');
  const [icon, setIcon]       = useState(existing?.icon ?? HABIT_ICONS[0]);
  const [color, setColor]     = useState(existing?.color ?? HABIT_COLORS[0]);
  const [kind, setKind]       = useState<FreqKind>(existing?.frequency.kind ?? 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(
    existing?.frequency.kind === 'weekly' ? existing.frequency.weekdays : [2, 3, 4, 5, 6],
  );
  const [xperweekCount, setXperweekCount] = useState(
    existing?.frequency.kind === 'xperweek' ? existing.frequency.count : 3,
  );
  const [intervalDays, setIntervalDays] = useState(
    existing?.frequency.kind === 'interval' ? existing.frequency.days : 2,
  );
  const [hour, setHour]       = useState(existing?.frequency.hour ?? 8);
  const [minute, setMinute]   = useState(existing?.frequency.minute ?? 0);
  const [category, setCategory] = useState<HabitCategory>(existing?.category ?? 'Other');
  const [saving, setSaving]   = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerKey, setPickerKey]           = useState(0);
  // Temporary picker state — committed on "Confirm"
  const [pickerHour, setPickerHour]     = useState(existing?.frequency.hour ?? 8);
  const [pickerMinute, setPickerMinute] = useState(existing?.frequency.minute ?? 0);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setIcon(existing.icon);
      setColor(existing.color);
      setKind(existing.frequency.kind);
      setHour(existing.frequency.hour);
      setMinute(existing.frequency.minute);
      if (existing.frequency.kind === 'weekly')   setWeekdays(existing.frequency.weekdays);
      if (existing.frequency.kind === 'xperweek') setXperweekCount(existing.frequency.count);
      if (existing.frequency.kind === 'interval') setIntervalDays(existing.frequency.days);
      setCategory(existing.category ?? 'Other');
    }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleWeekday(day: number) {
    setWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Name required', 'Please enter a habit name.'); return; }
    if (kind === 'weekly' && weekdays.length === 0) {
      Alert.alert('Select days', 'Choose at least one day.'); return;
    }
    const frequency: Frequency =
      kind === 'daily'    ? { kind: 'daily',    hour, minute } :
      kind === 'weekly'   ? { kind: 'weekly',   weekdays, hour, minute } :
      kind === 'weekdays' ? { kind: 'weekdays', hour, minute } :
      kind === 'weekends' ? { kind: 'weekends', hour, minute } :
      kind === 'xperweek' ? { kind: 'xperweek', count: xperweekCount, hour, minute } :
      /* interval */        { kind: 'interval',  days:  intervalDays,  hour, minute };
    setSaving(true);
    try {
      if (existing) {
        await updateHabit(existing.id, { name: trimmed, icon, color, frequency, category });
      } else {
        await addHabit({ name: trimmed, icon, color, frequency, category });
      }
      router.back();
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally { setSaving(false); }
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.title}>{existing ? 'Edit Habit' : 'New Habit'}</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.headerBtn}>
          <Text style={[s.save, saving && { opacity: 0.4 }]}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Preview */}
          <View style={s.preview}>
            <View style={[s.previewBadge, { backgroundColor: color }]}>
              <Ionicons name={icon as never} size={36} color="#fff" />
            </View>
            <Text style={s.previewName} numberOfLines={1}>{name || 'Habit name'}</Text>
          </View>

          {/* Name */}
          <Section label="Name" C={C}>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Drink Water, Read, Workout"
              placeholderTextColor={C.textMuted}
              returnKeyType="done"
              maxLength={40}
            />
          </Section>

          {/* Icon */}
          <Section label="Icon" C={C}>
            <View style={s.iconGrid}>
              {HABIT_ICONS.map(ic => (
                <TouchableOpacity
                  key={ic}
                  style={[s.iconOption, { backgroundColor: ic === icon ? color : C.surfaceAlt }]}
                  onPress={() => setIcon(ic)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={ic as never} size={22} color={ic === icon ? '#fff' : C.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          </Section>

          {/* Color */}
          <Section label="Color" C={C}>
            <View style={s.colorRow}>
              {HABIT_COLORS.map(col => (
                <TouchableOpacity
                  key={col}
                  style={[s.colorSwatch, { backgroundColor: col }, col === color && { borderWidth: 2.5, borderColor: C.text }]}
                  onPress={() => setColor(col)}
                  activeOpacity={0.8}
                >
                  {col === color && <Ionicons name="checkmark" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </Section>

          {/* Category */}
          <Section label="Category" C={C}>
            <View style={s.catGrid}>
              {CATEGORIES.map(cat => {
                const meta    = CATEGORY_META[cat];
                const active  = category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      s.catChip,
                      { borderColor: active ? meta.color : C.border, backgroundColor: active ? meta.color + '18' : C.surfaceAlt },
                    ]}
                    onPress={() => setCategory(cat)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={meta.icon as never} size={14} color={active ? meta.color : C.textMuted} />
                    <Text style={[s.catChipText, { color: active ? meta.color : C.textMuted, fontWeight: active ? '700' : '500' }]}>
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Section>

          {/* Frequency */}
          <Section label="Frequency" C={C}>
            {/* Type picker chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {FREQ_OPTIONS.map(opt => {
                const active = kind === opt.kind;
                return (
                  <TouchableOpacity
                    key={opt.kind}
                    style={[s.freqChip, { borderColor: active ? color : C.border, backgroundColor: active ? color : C.surfaceAlt }]}
                    onPress={() => setKind(opt.kind)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={opt.icon as never} size={14} color={active ? '#fff' : C.textSecondary} />
                    <Text style={[s.freqChipText, { color: active ? '#fff' : C.textSecondary, fontWeight: active ? '700' : '500' }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Specific days picker — for weekly */}
            {kind === 'weekly' && (
              <View style={s.weekRow}>
                {DAY_LABELS.map((label, i) => {
                  const day = i + 1;
                  const selected = weekdays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[s.dayBtn, { borderColor: C.border, backgroundColor: C.surface }, selected && { backgroundColor: color, borderColor: color }]}
                      onPress={() => toggleWeekday(day)}
                    >
                      <Text style={[{ fontSize: 13, fontWeight: '600', color: C.textSecondary }, selected && { color: '#fff' }]}>{label}</Text>
                      <Text style={[{ fontSize: 9, color: C.textMuted }, selected && { color: '#fff' }]}>{DAY_FULL[i]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Count stepper — for xperweek */}
            {kind === 'xperweek' && (
              <View style={[s.stepper, { backgroundColor: C.surface, borderColor: C.border }]}>
                <TouchableOpacity
                  onPress={() => setXperweekCount(c => Math.max(1, c - 1))}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="remove-circle" size={32} color={xperweekCount > 1 ? C.tint : C.border} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[s.stepperValue, { color: C.text }]}>{xperweekCount}</Text>
                  <Text style={[s.stepperUnit, { color: C.textMuted }]}>times per week</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setXperweekCount(c => Math.min(6, c + 1))}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="add-circle" size={32} color={xperweekCount < 6 ? C.tint : C.border} />
                </TouchableOpacity>
              </View>
            )}

            {/* Days stepper — for interval */}
            {kind === 'interval' && (
              <View style={[s.stepper, { backgroundColor: C.surface, borderColor: C.border }]}>
                <TouchableOpacity
                  onPress={() => setIntervalDays(d => Math.max(2, d - 1))}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="remove-circle" size={32} color={intervalDays > 2 ? C.tint : C.border} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[s.stepperValue, { color: C.text }]}>{intervalDays}</Text>
                  <Text style={[s.stepperUnit, { color: C.textMuted }]}>days between reminders</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIntervalDays(d => Math.min(30, d + 1))}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="add-circle" size={32} color={intervalDays < 30 ? C.tint : C.border} />
                </TouchableOpacity>
              </View>
            )}

            {/* Summary label */}
            <Text style={[s.freqSummary, { color: C.textMuted }]}>
              {kind === 'daily'    && 'Repeats every day'}
              {kind === 'weekdays' && 'Repeats Monday to Friday'}
              {kind === 'weekends' && 'Repeats Saturday and Sunday'}
              {kind === 'weekly'   && `Repeats on selected days (${weekdays.length} selected)`}
              {kind === 'xperweek' && `Complete any ${xperweekCount} days per week`}
              {kind === 'interval' && `Complete once every ${intervalDays} days`}
            </Text>
          </Section>

          {/* Time */}
          <Section label="Reminder Time" C={C}>
            <TouchableOpacity
              style={[s.timePill, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={() => { setPickerHour(hour); setPickerMinute(minute); setPickerKey(k => k + 1); setShowTimePicker(true); }}
              activeOpacity={0.75}
            >
              <Ionicons name="time-outline" size={20} color={C.tint} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.tint, letterSpacing: -0.5 }}>
                {formatTime(hour, minute)}
              </Text>
              <Ionicons name="chevron-down" size={14} color={C.textMuted} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </Section>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Clock picker modal ── */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: C.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: C.textMuted }]}>REMINDER TIME</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Ionicons name="close" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 24, paddingBottom: 8 }}>
              <ClockFace
                key={pickerKey}
                hour24={pickerHour}
                minute={pickerMinute}
                onChangeHour={setPickerHour}
                onChangeMinute={setPickerMinute}
                C={C}
              />
            </View>
            <View style={{ paddingHorizontal: 24, paddingBottom: 32, paddingTop: 16 }}>
              <TouchableOpacity
                style={[s.confirmBtn, { backgroundColor: C.tint }]}
                onPress={() => { setHour(pickerHour); setMinute(pickerMinute); setShowTimePicker(false); }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                  Confirm {formatTime(pickerHour, pickerMinute)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(C: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
    headerBtn: { minWidth: 64 },
    title: { fontSize: 16, fontWeight: '600', color: C.text },
    cancel: { fontSize: 16, color: C.textSecondary },
    save: { fontSize: 16, fontWeight: '600', color: C.tint, textAlign: 'right' },
    content: { padding: 20, gap: 28, paddingBottom: 48 },
    preview: { alignItems: 'center', gap: 12, paddingVertical: 12 },
    previewBadge: { width: 80, height: 80, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    previewName: { fontSize: 17, fontWeight: '600', color: C.text },
    input: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: C.text },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    iconOption: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    colorRow: { flexDirection: 'row', gap: 10 },
    colorSwatch: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    freqChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8,
    },
    freqChipText: { fontSize: 13 },
    weekRow: { flexDirection: 'row', gap: 6 },
    dayBtn: { flex: 1, alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingVertical: 8, gap: 2 },
    stepper: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderRadius: 14, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 14,
    },
    stepperValue: { fontSize: 32, fontWeight: '700', letterSpacing: -1 },
    stepperUnit:  { fontSize: 12, marginTop: 2 },
    freqSummary:  { fontSize: 12, textAlign: 'center' },
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
    catChipText: { fontSize: 13 },
    timePill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
    modalOverlay: { flex: 1, backgroundColor: '#00000070', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 4 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
    modalTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
    confirmBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  });
}
