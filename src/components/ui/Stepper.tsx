import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useColors } from '@/contexts/ThemeContext';

type Props = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

/** Big-touch numeric stepper used for habit creation forms. */
export function Stepper({ value, onChange, min = 0, max = 999, step = 1, unit }: Props) {
  const C = useColors();
  const canDec = value - step >= min;
  const canInc = value + step <= max;

  return (
    <View style={[styles.wrap, { backgroundColor: C.surface, borderColor: C.border }]}>
      <TouchableOpacity
        onPress={() => {
          if (!canDec) return;
          Haptics.selectionAsync().catch(() => null);
          onChange(value - step);
        }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        disabled={!canDec}
      >
        <Ionicons name="remove-circle" size={32} color={canDec ? C.tint : C.border} />
      </TouchableOpacity>

      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text style={[styles.value, { color: C.text }]}>{value}</Text>
        {unit && <Text style={[styles.unit, { color: C.textMuted }]}>{unit}</Text>}
      </View>

      <TouchableOpacity
        onPress={() => {
          if (!canInc) return;
          Haptics.selectionAsync().catch(() => null);
          onChange(value + step);
        }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        disabled={!canInc}
      >
        <Ionicons name="add-circle" size={32} color={canInc ? C.tint : C.border} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  value: { fontSize: 32, fontWeight: '700', letterSpacing: -1 },
  unit: { fontSize: 12, marginTop: 2 },
});
