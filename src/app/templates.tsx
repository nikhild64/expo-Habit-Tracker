import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHabitsStore } from '@/contexts/HabitsContext';
import { useColors } from '@/contexts/ThemeContext';
import {
  getTemplatesByBundle,
  HABIT_TEMPLATES,
  TEMPLATE_BUNDLES,
  type HabitTemplate,
  type TemplateBundle,
} from '@/lib/habits/templates';
import type { Colors } from '@/lib/ui/theme';

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  added,
  onAdd,
  C,
}: {
  template: HabitTemplate;
  added: boolean;
  onAdd: () => void;
  C: Colors;
}) {
  const s = useMemo(() => cardStyles(C), [C]);
  const h = template.frequency.hour;
  const m = template.frequency.minute.toString().padStart(2, '0');
  const period = h >= 12 ? 'PM' : 'AM';
  const hLabel = `${h % 12 || 12}:${m} ${period}`;
  const freqLabel = template.frequency.kind === 'daily' ? `Daily · ${hLabel}` : hLabel;

  return (
    <View style={[s.card, { borderColor: C.border, backgroundColor: C.surface }]}>
      <View style={[s.iconBadge, { backgroundColor: template.color }]}>
        <Ionicons name={template.icon as never} size={20} color="#fff" />
      </View>
      <View style={s.info}>
        <Text style={[s.name, { color: C.text }]}>{template.name}</Text>
        <Text style={[s.desc, { color: C.textMuted }]} numberOfLines={1}>
          {template.description}
        </Text>
        <Text style={[s.freq, { color: C.textSecondary }]}>{freqLabel}</Text>
      </View>
      <TouchableOpacity
        style={[s.addBtn, added && s.addBtnDone, { backgroundColor: added ? C.doneLight : C.tintLight }]}
        onPress={added ? undefined : onAdd}
        activeOpacity={added ? 1 : 0.8}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons
          name={added ? 'checkmark' : 'add'}
          size={18}
          color={added ? C.done : C.tint}
        />
      </TouchableOpacity>
    </View>
  );
}

// ── Bundle section ────────────────────────────────────────────────────────────

function BundleSection({
  bundle,
  addedIds,
  onAdd,
  onAddAll,
  C,
}: {
  bundle: TemplateBundle;
  addedIds: Set<string>;
  onAdd: (t: HabitTemplate) => void;
  onAddAll: (templates: HabitTemplate[]) => void;
  C: Colors;
}) {
  const s = useMemo(() => bundleStyles(C), [C]);
  const templates = getTemplatesByBundle(bundle.id);
  const allAdded = templates.every(t => addedIds.has(t.id));

  return (
    <View style={s.section}>
      {/* Bundle header */}
      <View style={s.header}>
        <View style={[s.headerIcon, { backgroundColor: bundle.color + '22' }]}>
          <Ionicons name={bundle.icon as never} size={16} color={bundle.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: C.text }]}>{bundle.label}</Text>
          <Text style={[s.headerDesc, { color: C.textMuted }]}>{bundle.description}</Text>
        </View>
        <TouchableOpacity
          style={[
            s.addAllBtn,
            { borderColor: allAdded ? C.done : bundle.color },
            allAdded && { backgroundColor: C.doneLight },
          ]}
          onPress={allAdded ? undefined : () => onAddAll(templates)}
          activeOpacity={allAdded ? 1 : 0.8}
        >
          <Text style={[s.addAllText, { color: allAdded ? C.done : bundle.color }]}>
            {allAdded ? 'Added' : `Add all ${templates.length}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Template cards */}
      <View style={s.cards}>
        {templates.map(t => (
          <TemplateCard
            key={t.id}
            template={t}
            added={addedIds.has(t.id)}
            onAdd={() => onAdd(t)}
            C={C}
          />
        ))}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TemplatesScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { addHabit, habits } = useHabitsStore();

  // Track which template IDs have been added this session (or were already habits)
  const [addedIds, setAddedIds] = useState<Set<string>>(() => {
    // Pre-mark templates whose name already exists in habits
    const existing = new Set(habits.map(h => h.name.toLowerCase()));
    return new Set(
      HABIT_TEMPLATES.filter(t => existing.has(t.name.toLowerCase())).map(t => t.id),
    );
  });

  async function handleAdd(template: HabitTemplate) {
    await addHabit({
      name: template.name,
      icon: template.icon,
      color: template.color,
      frequency: template.frequency,
      category: template.category,
    });
    setAddedIds(prev => new Set([...prev, template.id]));
  }

  async function handleAddAll(templates: HabitTemplate[]) {
    const toAdd = templates.filter(t => !addedIds.has(t.id));
    if (toAdd.length === 0) return;

    Alert.alert(
      `Add ${toAdd.length} habit${toAdd.length > 1 ? 's' : ''}?`,
      toAdd.map(t => `• ${t.name}`).join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add all',
          onPress: async () => {
            for (const t of toAdd) {
              await addHabit({
                name: t.name,
                icon: t.icon,
                color: t.color,
                frequency: t.frequency,
                category: t.category,
              });
            }
            setAddedIds(prev => new Set([...prev, ...toAdd.map(t => t.id)]));
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as never)}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Habit Templates</Text>
          <Text style={s.subtitle}>{HABIT_TEMPLATES.length} ready-made habits to get started</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {TEMPLATE_BUNDLES.map(bundle => (
          <BundleSection
            key={bundle.id}
            bundle={bundle}
            addedIds={addedIds}
            onAdd={handleAdd}
            onAddAll={handleAddAll}
            C={C}
          />
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(C: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: C.surfaceAlt,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
    subtitle: { fontSize: 13, color: C.textMuted, marginTop: 1 },

    content: { paddingHorizontal: 16, paddingTop: 8, gap: 24 },
  });
}

function bundleStyles(C: Colors) {
  return StyleSheet.create({
    section: { gap: 10 },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    headerIcon: {
      width: 36, height: 36, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 16, fontWeight: '700' },
    headerDesc: { fontSize: 12, marginTop: 1 },

    addAllBtn: {
      borderWidth: 1.5, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 5,
    },
    addAllText: { fontSize: 12, fontWeight: '700' },

    cards: { gap: 8 },
  });
}

function cardStyles(C: Colors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 14, borderWidth: 1,
      padding: 12,
    },
    iconBadge: {
      width: 44, height: 44, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    info: { flex: 1, gap: 2 },
    name: { fontSize: 15, fontWeight: '600' },
    desc: { fontSize: 12, lineHeight: 16 },
    freq: { fontSize: 11, fontWeight: '500', marginTop: 1 },

    addBtn: {
      width: 34, height: 34, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    addBtnDone: {},
  });
}
