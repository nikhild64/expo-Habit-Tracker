/**
 * Toast overlay — renders the currently-visible toast from `ToastContext`
 * just above the tab bar with a spring slide-in.
 *
 * Mount once at the root of the app (above the navigator) so it floats over
 * every screen. Reads from `useToast()` and handles its own animation.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useToast } from '@/contexts/ToastContext';
import { useColors } from '@/contexts/ThemeContext';
import { useReduceMotion } from '@/lib/ui/a11y';
import { SPRINGS, TIMINGS } from '@/lib/ui/motion';

const KIND_META = {
  success: { icon: 'checkmark-circle' as const, tint: '#10B981' },
  error:   { icon: 'alert-circle'     as const, tint: '#EF4444' },
  info:    { icon: 'information-circle' as const, tint: '#3B82F6' },
};

export function ToastOverlay() {
  const C = useColors();
  const { current, dismiss } = useToast();
  const reduceMotion = useReduceMotion();

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);

  useEffect(() => {
    if (current) {
      if (reduceMotion) {
        opacity.value = 1;
        translateY.value = 0;
      } else {
        opacity.value = withTiming(1, TIMINGS.fast);
        translateY.value = withSpring(0, SPRINGS.snappy);
      }
      const ht =
        current.kind === 'error'
          ? Haptics.NotificationFeedbackType.Error
          : current.kind === 'success'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning;
      Haptics.notificationAsync(ht).catch(() => null);
    } else {
      if (reduceMotion) {
        opacity.value = 0;
      } else {
        opacity.value = withTiming(0, TIMINGS.fast);
        translateY.value = withTiming(24, TIMINGS.fast);
      }
    }
  }, [current, reduceMotion, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!current) return null;

  const meta = KIND_META[current.kind];

  return (
    <SafeAreaView pointerEvents="box-none" edges={['bottom']} style={s.safe}>
      <View pointerEvents="box-none" style={s.wrap}>
        <Animated.View
          style={[
            s.toast,
            { backgroundColor: C.surface, borderColor: C.border },
            animStyle,
          ]}
        >
          <Ionicons name={meta.icon} size={20} color={meta.tint} />
          <Text style={[s.message, { color: C.text }]} numberOfLines={2}>
            {current.message}
          </Text>
          {current.actionLabel && (
            <Pressable
              onPress={() => {
                current.onAction?.();
                dismiss();
                Haptics.selectionAsync().catch(() => null);
              }}
              style={s.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={current.actionLabel}
            >
              <Text style={[s.actionText, { color: meta.tint }]}>
                {current.actionLabel}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={dismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={s.dismissBtn}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Ionicons name="close" size={16} color={C.textMuted} />
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 64, // sits just above tab bar (56dp + small breathing room)
    zIndex: 200,
  },
  wrap: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 260,
    maxWidth: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
  },
  message: { flex: 1, fontSize: 14, fontWeight: '500', lineHeight: 19 },
  actionBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  actionText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  dismissBtn: { padding: 2 },
});
