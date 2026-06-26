import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useColors } from '@/contexts/ThemeContext';
import { SPRINGS } from '@/lib/ui/motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  hapticImpact?: 'light' | 'medium' | 'heavy';
  style?: StyleProp<ViewStyle>;
};

/**
 * Themed button with press animation, optional icon, loading state, and haptic.
 */
export function Button({
  label, onPress, variant = 'primary',
  icon, iconRight, loading = false, disabled = false,
  fullWidth = false, hapticImpact = 'light', style,
}: Props) {
  const C = useColors();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const palette = useMemo(() => {
    switch (variant) {
      case 'primary':
        return { bg: C.tint, fg: '#fff', border: C.tint };
      case 'secondary':
        return { bg: C.surfaceAlt, fg: C.text, border: C.border };
      case 'ghost':
        return { bg: 'transparent', fg: C.text, border: 'transparent' };
      case 'danger':
        return { bg: C.danger, fg: '#fff', border: C.danger };
    }
  }, [C, variant]);

  function handlePress() {
    if (loading || disabled) return;
    if (hapticImpact === 'light')   Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    if (hapticImpact === 'medium')  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    if (hapticImpact === 'heavy')   Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => null);
    onPress();
  }

  return (
    <Animated.View style={[animStyle, fullWidth && { alignSelf: 'stretch' }]}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97, SPRINGS.snappy); }}
        onPressOut={() => { scale.value = withSpring(1, SPRINGS.snappy); }}
        onPress={handlePress}
        disabled={disabled || loading}
        style={[
          styles.base,
          { backgroundColor: palette.bg, borderColor: palette.border },
          variant === 'secondary' && { borderWidth: 1 },
          (disabled || loading) && { opacity: 0.5 },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <View style={styles.inner}>
            {icon && <Ionicons name={icon} size={18} color={palette.fg} />}
            <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
            {iconRight && <Ionicons name={iconRight} size={18} color={palette.fg} />}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },
});
