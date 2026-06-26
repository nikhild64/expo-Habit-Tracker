import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { useMood } from '@/contexts/MoodContext';
import { useColors } from '@/contexts/ThemeContext';
import { ENERGY_LABEL, MOOD_EMOJI, MOOD_LABEL } from '@/lib/mood/storage';
import type { MoodScore } from '@/lib/mood/storage';
import { toDateKey } from '@/lib/habits/streak';
import type { Colors } from '@/lib/ui/theme';

const SCORES: MoodScore[] = [1, 2, 3, 4, 5];

function formatDate(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function JournalScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { date } = useLocalSearchParams<{ date?: string }>();
  const dateKey = date || toDateKey(new Date());
  const { entries, upsertEntry, setReflection } = useMood();
  const existing = entries[dateKey];

  const [reflection, setLocalReflection] = useState(existing?.reflection ?? '');
  const [morningMood, setMorningMood] = useState<MoodScore | undefined>(existing?.morningMood);
  const [morningEnergy, setMorningEnergy] = useState<MoodScore | undefined>(existing?.morningEnergy);
  const [eveningMood, setEveningMood] = useState<MoodScore | undefined>(existing?.eveningMood);
  const [eveningEnergy, setEveningEnergy] = useState<MoodScore | undefined>(existing?.eveningEnergy);

  useEffect(() => {
    setLocalReflection(existing?.reflection ?? '');
    setMorningMood(existing?.morningMood);
    setMorningEnergy(existing?.morningEnergy);
    setEveningMood(existing?.eveningMood);
    setEveningEnergy(existing?.eveningEnergy);
  }, [dateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    await upsertEntry(dateKey, {
      morningMood,
      morningEnergy,
      eveningMood,
      eveningEnergy,
    });
    await setReflection(dateKey, reflection);
    router.back();
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.iconBtn}>
          <Ionicons name="close" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.title}>Journal</Text>
          <Text style={s.sub}>{formatDate(dateKey)}</Text>
        </View>
        <TouchableOpacity onPress={save} hitSlop={10} style={s.iconBtn}>
          <Text style={[s.save, { color: C.tint }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={[s.sectionLabel, { color: C.textMuted }]}>MORNING</Text>
            <MoodPicker label="Mood"   labels={MOOD_LABEL}   value={morningMood}   onChange={setMorningMood} C={C} />
            <MoodPicker label="Energy" labels={ENERGY_LABEL} value={morningEnergy} onChange={setMorningEnergy} C={C} />
          </Card>

          <Card>
            <Text style={[s.sectionLabel, { color: C.textMuted }]}>EVENING</Text>
            <MoodPicker label="Mood"   labels={MOOD_LABEL}   value={eveningMood}   onChange={setEveningMood} C={C} />
            <MoodPicker label="Energy" labels={ENERGY_LABEL} value={eveningEnergy} onChange={setEveningEnergy} C={C} />
          </Card>

          <Text style={[s.sectionLabel, { color: C.textMuted, marginLeft: 4 }]}>REFLECTION</Text>
          <Card>
            <TextInput
              style={[s.input, { color: C.text }]}
              value={reflection}
              onChangeText={setLocalReflection}
              placeholder="What went well? What did you struggle with? Anything to remember…"
              placeholderTextColor={C.textMuted}
              multiline
              autoFocus={!existing?.reflection}
              returnKeyType="default"
            />
          </Card>

          <View style={{ height: 12 }} />
          <Button label="Save Journal" icon="save-outline" onPress={save} fullWidth />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MoodPicker({
  label, labels, value, onChange, C,
}: {
  label: string;
  labels: Record<MoodScore, string>;
  value: MoodScore | undefined;
  onChange: (v: MoodScore | undefined) => void;
  C: Colors;
}) {
  return (
    <View style={mp.wrap}>
      <Text style={[mp.label, { color: C.text }]}>{label}</Text>
      <View style={mp.row}>
        {SCORES.map(score => {
          const active = value === score;
          return (
            <TouchableOpacity
              key={score}
              style={[
                mp.cell,
                { backgroundColor: active ? C.tint : C.surfaceAlt, borderColor: active ? C.tint : 'transparent' },
              ]}
              onPress={() => onChange(active ? undefined : score)}
              activeOpacity={0.85}
            >
              <Text style={mp.emoji}>{MOOD_EMOJI[score]}</Text>
              <Text style={[mp.cellLabel, { color: active ? '#fff' : C.textMuted, fontWeight: active ? '700' : '600' }]}>
                {labels[score]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(C: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    iconBtn: { paddingHorizontal: 4 },
    title: { fontSize: 17, fontWeight: '700', color: C.text },
    sub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    save: { fontSize: 16, fontWeight: '700' },
    content: { padding: 16, gap: 12, paddingBottom: 48 },
    sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
    input: {
      minHeight: 140, fontSize: 15, lineHeight: 22,
      textAlignVertical: 'top',
    },
  });
}

const mp = StyleSheet.create({
  wrap: { marginTop: 6 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, borderRadius: 12, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center', gap: 2 },
  emoji: { fontSize: 22 },
  cellLabel: { fontSize: 10 },
});
