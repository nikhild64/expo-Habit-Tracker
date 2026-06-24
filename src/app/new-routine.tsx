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
import { useHabitsStore } from '@/contexts/HabitsContext';
import { useRoutinesStore } from '@/contexts/RoutinesContext';
import { useColors } from '@/contexts/ThemeContext';
import { HABIT_COLORS, HABIT_ICONS } from '@/lib/ui/colors';
import type { Colors } from '@/lib/ui/theme';

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

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

export default function NewRoutineScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);

  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { routines, addRoutine, updateRoutine } = useRoutinesStore();
  const { habits } = useHabitsStore();
  const existing = edit ? routines.find(r => r.id === edit) : undefined;

  const activeHabits = useMemo(
    () => habits.filter(h => (h.status ?? 'active') === 'active'),
    [habits],
  );

  const [name, setName]             = useState(existing?.name ?? '');
  const [icon, setIcon]             = useState(existing?.icon ?? HABIT_ICONS[0]);
  const [color, setColor]           = useState(existing?.color ?? HABIT_COLORS[0]);
  const [habitIds, setHabitIds]     = useState<string[]>(existing?.habitIds ?? []);
  const [enableReminder, setEnableReminder] = useState(existing?.reminderTime != null);
  const [hour, setHour]             = useState(existing?.reminderTime?.hour ?? 7);
  const [minute, setMinute]         = useState(existing?.reminderTime?.minute ?? 0);
  const [saving, setSaving]         = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerKey, setPickerKey]   = useState(0);
  const [pickerHour, setPickerHour]     = useState(existing?.reminderTime?.hour ?? 7);
  const [pickerMinute, setPickerMinute] = useState(existing?.reminderTime?.minute ?? 0);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setIcon(existing.icon);
      setColor(existing.color);
      setHabitIds(existing.habitIds);
      setEnableReminder(existing.reminderTime != null);
      if (existing.reminderTime) {
        setHour(existing.reminderTime.hour);
        setMinute(existing.reminderTime.minute);
      }
    }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleHabit(habitId: string) {
    setHabitIds(prev =>
      prev.includes(habitId) ? prev.filter(id => id !== habitId) : [...prev, habitId],
    );
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Name required', 'Please enter a routine name.'); return; }
    if (habitIds.length === 0) {
      Alert.alert('Select habits', 'Choose at least one habit for this routine.'); return;
    }
    setSaving(true);
    try {
      const reminderTime = enableReminder ? { hour, minute } : null;
      if (existing) {
        await updateRoutine(existing.id, { name: trimmed, icon, color, habitIds, reminderTime });
      } else {
        await addRoutine({ name: trimmed, icon, color, habitIds, reminderTime });
      }
      router.back();
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.title}>{existing ? 'Edit Routine' : 'New Routine'}</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.headerBtn}>
          <Text style={[s.saveText, saving && { opacity: 0.4 }]}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Preview */}
          <View style={s.preview}>
            <View style={[s.previewBadge, { backgroundColor: color }]}>
              <Ionicons name={icon as never} size={36} color="#fff" />
            </View>
            <Text style={s.previewName} numberOfLines={1}>{name || 'Routine name'}</Text>
            <Text style={s.previewSub}>
              {habitIds.length} habit{habitIds.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Name */}
          <Section label="Name" C={C}>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Morning Routine, Evening Wind-down"
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

          {/* Habits multi-select */}
          <Section label="Habits" C={C}>
            {activeHabits.length === 0 ? (
              <View style={[s.emptyHabits, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                <Ionicons name="leaf-outline" size={22} color={C.textMuted} />
                <Text style={[s.emptyText, { color: C.textMuted }]}>
                  No active habits yet. Create some habits first.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {activeHabits.map(habit => {
                  const selected = habitIds.includes(habit.id);
                  return (
                    <TouchableOpacity
                      key={habit.id}
                      style={[
                        s.habitRow,
                        { backgroundColor: C.surface, borderColor: selected ? habit.color : C.border },
                        selected && s.habitRowSelected,
                      ]}
                      onPress={() => toggleHabit(habit.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[s.habitIcon, { backgroundColor: habit.color }]}>
                        <Ionicons name={habit.icon as never} size={18} color="#fff" />
                      </View>
                      <Text style={[s.habitName, { color: C.text }]} numberOfLines={1}>
                        {habit.name}
                      </Text>
                      <View style={[
                        s.checkbox,
                        { borderColor: selected ? habit.color : C.border },
                        selected && { backgroundColor: habit.color },
                      ]}>
                        {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {habitIds.length > 0 && (
              <Text style={[s.selectionNote, { color: C.textMuted }]}>
                {habitIds.length} habit{habitIds.length !== 1 ? 's' : ''} selected
              </Text>
            )}
          </Section>

          {/* Reminder */}
          <Section label="Reminder" C={C}>
            <TouchableOpacity
              style={[s.reminderToggle, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={() => setEnableReminder(v => !v)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="notifications-outline"
                size={18}
                color={enableReminder ? C.tint : C.textMuted}
              />
              <Text style={[s.reminderToggleText, { color: enableReminder ? C.text : C.textMuted }]}>
                Daily reminder
              </Text>
              <View style={[s.toggleTrack, { backgroundColor: enableReminder ? C.tint : C.border }]}>
                <View style={[s.toggleThumb, enableReminder && s.toggleThumbOn]} />
              </View>
            </TouchableOpacity>

            {enableReminder && (
              <TouchableOpacity
                style={[s.timePill, { backgroundColor: C.surface, borderColor: C.border }]}
                onPress={() => {
                  setPickerHour(hour);
                  setPickerMinute(minute);
                  setPickerKey(k => k + 1);
                  setShowTimePicker(true);
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="time-outline" size={20} color={C.tint} />
                <Text style={{ fontSize: 17, fontWeight: '700', color: C.tint, letterSpacing: -0.5 }}>
                  {formatTime(hour, minute)}
                </Text>
                <Ionicons name="chevron-down" size={14} color={C.textMuted} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            )}
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
                onPress={() => {
                  setHour(pickerHour);
                  setMinute(pickerMinute);
                  setShowTimePicker(false);
                }}
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
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface,
    },
    headerBtn:  { minWidth: 64 },
    title:      { fontSize: 16, fontWeight: '600', color: C.text },
    cancel:     { fontSize: 16, color: C.textSecondary },
    saveText:   { fontSize: 16, fontWeight: '600', color: C.tint, textAlign: 'right' },

    content:     { padding: 20, gap: 28, paddingBottom: 48 },
    preview:     { alignItems: 'center', gap: 8, paddingVertical: 12 },
    previewBadge:{ width: 80, height: 80, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    previewName: { fontSize: 17, fontWeight: '600', color: C.text },
    previewSub:  { fontSize: 13, color: C.textMuted },

    input: {
      backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: C.text,
    },

    iconGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    iconOption: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

    colorRow:   { flexDirection: 'row', gap: 10 },
    colorSwatch:{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

    emptyHabits: {
      flexDirection: 'column', alignItems: 'center', gap: 8,
      borderRadius: 12, borderWidth: 1, padding: 20,
    },
    emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

    habitRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 12, borderWidth: 1, padding: 12,
    },
    habitRowSelected: { borderWidth: 1.5 },
    habitIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    habitName: { flex: 1, fontSize: 14, fontWeight: '500' },
    checkbox: {
      width: 28, height: 28, borderRadius: 14, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },
    selectionNote: { fontSize: 12, textAlign: 'center' },

    reminderToggle: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14,
    },
    reminderToggleText: { flex: 1, fontSize: 15, fontWeight: '500' },
    toggleTrack: { width: 44, height: 24, borderRadius: 12, padding: 2 },
    toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
    toggleThumbOn: { marginLeft: 20 },

    timePill: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14,
    },

    modalOverlay: { flex: 1, backgroundColor: '#00000070', justifyContent: 'flex-end' },
    modalSheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 4 },
    modalHeader:  {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    modalTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
    confirmBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  });
}
