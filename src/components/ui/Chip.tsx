import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { useColors } from '@/contexts/ThemeContext';

type Props = {
  label: string;
  active?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  /** Override the active background color (defaults to theme tint). */
  activeColor?: string;
};

export function Chip({ label, active = false, icon, onPress, activeColor }: Props) {
  const C = useColors();
  const tint = activeColor ?? C.tint;
  return (
    <TouchableOpacity
      style={[
        styles.base,
        {
          backgroundColor: active ? tint : C.surfaceAlt,
          borderColor: active ? tint : C.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {icon && <Ionicons name={icon} size={13} color={active ? '#fff' : C.textSecondary} />}
      <Text style={[styles.label, { color: active ? '#fff' : C.textSecondary, fontWeight: active ? '700' : '600' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  label: { fontSize: 12 },
});
