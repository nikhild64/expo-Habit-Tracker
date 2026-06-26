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
import { useToast } from '@/contexts/ToastContext';
import type { Frequency, HabitCategory, HabitType, Subtask, TimeOfDay } from '@/lib/habits/types';
import { CATEGORY_META, HABIT_COLORS, HABIT_ICONS } from '@/lib/ui/colors';
import type { Colors } from '@/lib/ui/theme';

const CATEGORIES = Object.keys(CATEGORY_META) as HabitCategory[];

type FreqKind = Frequency['kind'];
const FREQ_OPTIONS: { kind: FreqKind; label: string; icon: string }[] = [
  { kind: 'daily',    label: 'Daily',         icon: 'sunny-outline'     },
  { kind: 'weekdays', label: 'Weekdays',      icon: 'briefcase-outline' },
  { kind: 'weekends', label: 'Weekends',      icon: 'cafe-outline'      },
  { kind: 'weekly',   label: 'Specific days', icon: 'calendar-outline'  },
  { kind: 'xperweek', label: 'X per week',    icon: 'repeat-outline'    },
  { kind: 'interval', label: 'Every N days',  icon: 'timer-outline'     },
];

const HABIT_TYPE_OPTIONS: { id: HabitType; label: string; sub: string; icon: string }[] = [
  { id: 'binary',       label: 'Yes / No',     sub: 'Tap to mark done',           icon: 'checkmark-circle-outline' },
  { id: 'quantitative', label: 'Count',         sub: 'Track toward a target',       icon: 'flask-outline'           },
  { id: 'timed',        label: 'Timed',         sub: 'Built-in timer + Pomodoro',   icon: 'timer-outline'           },
  { id: 'negative',     label: 'Quit habit',    sub: 'Track days without slipping', icon: 'remove-circle-outline'   },
];

const TIME_OF_DAY_OPTIONS: { id: TimeOfDay; label: string; icon: string }[] = [
  { id: 'morning',   label: 'Morning',   icon: 'sunny-outline'     },
  { id: 'afternoon', label: 'Afternoon', icon: 'partly-sunny-outline' },
  { id: 'evening',   label: 'Evening',   icon: 'moon-outline'      },
  { id: 'anytime',   label: 'Anytime',   icon: 'infinite-outline'  },
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_FULL   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function genId(): string {
  return 'st_' + Math.random().toString(36).slice(2, 9);
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ label, children, C, hint }: { label: string; children: ReactNode; C: Colors; hint?: string }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {label}
        </Text>
        {hint && <Text style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function NewHabitScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);

  const { edit, type } = useLocalSearchParams<{ edit?: string; type?: HabitType }>();
  const { habits, addHabit, updateHabit } = useHabitsStore();
  const toast = useToast();
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
  const [pickerHour, setPickerHour]     = useState(existing?.frequency.hour ?? 8);
  const [pickerMinute, setPickerMinute] = useState(existing?.frequency.minute ?? 0);

  // ── v7 fields ──
  const [habitType, setHabitType] = useState<HabitType>(
    existing?.habitType ?? (type && ['binary', 'quantitative', 'timed', 'negative'].includes(type) ? type : 'binary'),
  );
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(existing?.timeOfDay ?? 'anytime');
  const [targetValue, setTargetValue] = useState<number>(existing?.target?.value ?? 8);
  const [targetUnit,  setTargetUnit]  = useState<string>(existing?.target?.unit ?? 'glasses');
  const [timerMinutes, setTimerMinutes] = useState<number>(
    existing?.target?.timerSeconds ? Math.round(existing.target.timerSeconds / 60) : 25,
  );
  const [subtasks, setSubtasks] = useState<Subtask[]>(existing?.subtasks ?? []);
  const [newSubtaskText, setNewSubtaskText] = useState('');

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
      setHabitType(existing.habitType ?? 'binary');
      setTimeOfDay(existing.timeOfDay ?? 'anytime');
      setTargetValue(existing.target?.value ?? 8);
      setTargetUnit(existing.target?.unit ?? 'glasses');
      if (existing.target?.timerSeconds) setTimerMinutes(Math.round(existing.target.timerSeconds / 60));
      setSubtasks(existing.subtasks ?? []);
    }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleWeekday(day: number) {
    setWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  function addSubtask() {
    const trimmed = newSubtaskText.trim();
    if (!trimmed) return;
    setSubtasks(s => [...s, { id: genId(), label: trimmed }]);
    setNewSubtaskText('');
  }

  function removeSubtask(id: string) {
    setSubtasks(s => s.filter(st => st.id !== id));
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Please enter a habit name'); return; }
    if (kind === 'weekly' && weekdays.length === 0) {
      toast.error('Choose at least one day of the week'); return;
    }
    if (habitType === 'quantitative' && (targetValue < 1 || !targetUnit.trim())) {
      toast.error('Set a target value and unit'); return;
    }
    if (habitType === 'timed' && timerMinutes < 1) {
      toast.error('Set a target duration'); return;
    }

    const frequency: Frequency =
      kind === 'daily'    ? { kind: 'daily',    hour, minute } :
      kind === 'weekly'   ? { kind: 'weekly',   weekdays, hour, minute } :
      kind === 'weekdays' ? { kind: 'weekdays', hour, minute } :
      kind === 'weekends' ? { kind: 'weekends', hour, minute } :
      kind === 'xperweek' ? { kind: 'xperweek', count: xperweekCount, hour, minute } :
      /* interval */        { kind: 'interval',  days:  intervalDays,  hour, minute };

    const target = habitType === 'quantitative'
      ? { value: targetValue, unit: targetUnit.trim() || 'units' }
      : habitType === 'timed'
        ? { value: timerMinutes, unit: 'min', timerSeconds: timerMinutes * 60 }
        : undefined;

    setSaving(true);
    try {
      const payload = {
        name: trimmed,
        icon,
        color,
        frequency,
        category,
        habitType,
        timeOfDay,
        target,
        subtasks: subtasks.length > 0 ? subtasks : undefined,
      };
      if (existing) {
        await updateHabit(existing.id, payload);
        toast.success(`Updated "${trimmed}"`);
      } else {
        await addHabit(payload);
        toast.success(`Added "${trimmed}"`);
      }
      router.back();
    } catch (e) {
      toast.error(`Could not save habit: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
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
            {habitType !== 'binary' && (
              <View style={s.previewBadgeLabel}>
                <Text style={s.previewBadgeText}>
                  {HABIT_TYPE_OPTIONS.find(o => o.id === habitType)?.label}
                </Text>
              </View>
            )}
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

          {/* Habit type */}
          <Section label="Habit Type" C={C} hint={existing ? 'switching will reset progress' : undefined}>
            <View style={{ gap: 8 }}>
              {HABIT_TYPE_OPTIONS.map(opt => {
                const active = habitType === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      s.typeRow,
                      {
                        backgroundColor: active ? color + '14' : C.surface,
                        borderColor: active ? color : C.border,
                      },
                    ]}
                    onPress={() => setHabitType(opt.id)}
                    activeOpacity={0.85}
                  >
                    <View style={[s.typeIcon, { backgroundColor: active ? color : C.surfaceAlt }]}>
                      <Ionicons name={opt.icon as never} size={20} color={active ? '#fff' : C.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.typeLabel, { color: C.text, fontWeight: active ? '700' : '600' }]}>{opt.label}</Text>
                      <Text style={[s.typeSub, { color: C.textMuted }]}>{opt.sub}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color={color} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Section>

          {/* Type-specific target inputs */}
          {habitType === 'quantitative' && (
            <Section label="Target" C={C}>
              <View style={s.targetRow}>
                <TextInput
                  style={[s.input, { flex: 0.4, textAlign: 'center', fontSize: 22, fontWeight: '700' }]}
                  value={String(targetValue)}
                  onChangeText={t => setTargetValue(Math.max(1, parseInt(t.replace(/\D/g, ''), 10) || 1))}
                  keyboardType="number-pad"
                  maxLength={4}
                />
                <TextInput
                  style={[s.input, { flex: 0.6 }]}
                  value={targetUnit}
                  onChangeText={setTargetUnit}
                  placeholder="unit (glasses, pages, km…)"
                  placeholderTextColor={C.textMuted}
                  maxLength={20}
                />
              </View>
            </Section>
          )}

          {habitType === 'timed' && (
            <Section label="Duration (minutes)" C={C}>
              <View style={[s.stepper, { backgroundColor: C.surface, borderColor: C.border }]}>
                <TouchableOpacity
                  onPress={() => setTimerMinutes(d => Math.max(1, d - 5))}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="remove-circle" size={32} color={timerMinutes > 1 ? C.tint : C.border} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[s.stepperValue, { color: C.text }]}>{timerMinutes}</Text>
                  <Text style={[s.stepperUnit, { color: C.textMuted }]}>minutes per session</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setTimerMinutes(d => Math.min(180, d + 5))}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="add-circle" size={32} color={timerMinutes < 180 ? C.tint : C.border} />
                </TouchableOpacity>
              </View>
            </Section>
          )}

          {/* Sub-tasks (binary only — multi-step routines) */}
          {habitType === 'binary' && (
            <Section label="Checklist" C={C} hint="optional — done when all checked">
              {subtasks.length > 0 && (
                <View style={[s.subtaskList, { borderColor: C.border, backgroundColor: C.surface }]}>
                  {subtasks.map((st, i) => (
                    <View
                      key={st.id}
                      style={[s.subtaskRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
                    >
                      <Ionicons name="square-outline" size={16} color={C.textMuted} />
                      <Text style={[s.subtaskText, { color: C.text }]}>{st.label}</Text>
                      <TouchableOpacity onPress={() => removeSubtask(st.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="close-circle" size={18} color={C.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={newSubtaskText}
                  onChangeText={setNewSubtaskText}
                  placeholder="Add a step…"
                  placeholderTextColor={C.textMuted}
                  onSubmitEditing={addSubtask}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[s.addBtnSmall, { backgroundColor: color, opacity: newSubtaskText.trim() ? 1 : 0.3 }]}
                  onPress={addSubtask}
                  disabled={!newSubtaskText.trim()}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </Section>
          )}

          {/* Time of Day */}
          <Section label="Time of Day" C={C}>
            <View style={s.todRow}>
              {TIME_OF_DAY_OPTIONS.map(opt => {
                const active = timeOfDay === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      s.todCell,
                      { backgroundColor: active ? color + '18' : C.surfaceAlt, borderColor: active ? color : 'transparent' },
                    ]}
                    onPress={() => setTimeOfDay(opt.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={opt.icon as never} size={18} color={active ? color : C.textMuted} />
                    <Text style={[s.todText, { color: active ? color : C.textSecondary, fontWeight: active ? '700' : '600' }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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

      <Modal visible={showTimePicker} transparent animationType="slide" onRequestClose={() => setShowTimePicker(false)}>
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
    preview: { alignItems: 'center', gap: 10, paddingVertical: 12 },
    previewBadge: { width: 80, height: 80, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    previewName: { fontSize: 17, fontWeight: '600', color: C.text },
    previewBadgeLabel: { backgroundColor: C.surfaceAlt, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
    previewBadgeText: { fontSize: 11, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
    input: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: C.text },

    typeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 14, borderWidth: 1.5, padding: 12,
    },
    typeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    typeLabel: { fontSize: 15 },
    typeSub: { fontSize: 12, marginTop: 1 },

    targetRow: { flexDirection: 'row', gap: 10 },

    todRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    todCell: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 14, borderWidth: 1.5,
      paddingHorizontal: 14, paddingVertical: 9,
      flexGrow: 1, flexBasis: '45%',
    },
    todText: { fontSize: 13 },

    subtaskList: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
    subtaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
    subtaskText: { flex: 1, fontSize: 14 },
    addBtnSmall: { width: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },

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
