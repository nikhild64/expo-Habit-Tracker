/**
 * Frosted-glass card built on `expo-blur` (now stable on Android per SDK 55).
 *
 * Use for surfaces that should feel "elevated" over scrolling content — the
 * progress card on Today, the tab bar background, headers over hero images.
 *
 * `expo-blur` may degrade visually on Android < API 31; in that case the
 * underlying tinted background still provides enough contrast for legibility.
 */
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { useColors, useTheme } from '@/contexts/ThemeContext';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Blur intensity 0-100; default 60. */
  intensity?: number;
  /** Override blur tint. Defaults to follow the active theme. */
  tint?: 'light' | 'dark' | 'default' | 'systemMaterial';
  /** Compact padding (12 instead of 16). */
  compact?: boolean;
};

export function GlassCard({
  children,
  style,
  intensity = 60,
  tint,
  compact = false,
}: Props) {
  const C = useColors();
  const { isDark } = useTheme();

  // iOS plays nicely with systemMaterial; Android only supports light/dark/default
  const effectiveTint =
    tint ??
    (Platform.OS === 'ios' ? 'systemMaterial' : isDark ? 'dark' : 'light');

  return (
    <View
      style={[
        s.wrap,
        { borderColor: C.border, padding: compact ? 12 : 16 },
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint={effectiveTint}
        style={StyleSheet.absoluteFill}
      />
      {/* Soft tint overlay so colors don't get washed out on Android */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? '#1B1B2380' : '#FFFFFF60' },
        ]}
      />
      <View style={s.content}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: { position: 'relative' },
});
