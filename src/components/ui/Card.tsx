import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { useColors } from '@/contexts/ThemeContext';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Reduce padding for tighter rows. */
  compact?: boolean;
  /** Highlight border (used for completed routines, achievements, etc.) */
  highlight?: string;
};

export function Card({ children, style, compact = false, highlight }: Props) {
  const C = useColors();
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: C.surface,
          borderColor: highlight ?? C.border,
          padding: compact ? 12 : 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    borderWidth: 1,
  },
});
