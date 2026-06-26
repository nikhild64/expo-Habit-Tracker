/**
 * Floating Action Button with optional long-press radial menu.
 *
 * Single-tap fires `onPress`. Long-press (when `longPressActions` is provided)
 * fans out the secondary actions vertically above the FAB with their labels,
 * so the user can pick one before releasing or tapping. Tapping outside
 * collapses the menu.
 *
 * Positioned absolutely in the bottom-right by default. Use `bottomCenter` if
 * the screen has no tab bar (e.g. modal flows).
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/contexts/ThemeContext';
import { useReduceMotion } from '@/lib/ui/a11y';
import { SPRINGS, TIMINGS } from '@/lib/ui/motion';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type FABAction = {
  icon: IoniconName;
  label: string;
  /** Background color for the mini-fab. Defaults to theme tint. */
  color?: string;
  onPress: () => void;
};

type Props = {
  icon: IoniconName;
  onPress: () => void;
  longPressActions?: FABAction[];
  position?: 'bottomRight' | 'bottomCenter';
  /** Optional override for the FAB background color. Defaults to theme tint. */
  color?: string;
  /** Visible label next to the FAB when expanded (rarely needed). */
  accessibilityLabel?: string;
};

export function FAB({
  icon,
  onPress,
  longPressActions = [],
  position = 'bottomRight',
  color,
  accessibilityLabel = 'Open quick actions',
}: Props) {
  const C = useColors();
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(false);

  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const expand = useSharedValue(0); // 0 collapsed, 1 expanded

  useEffect(() => {
    expand.value = reduceMotion
      ? (open ? 1 : 0)
      : withSpring(open ? 1 : 0, SPRINGS.smooth);
    rotation.value = reduceMotion
      ? (open ? 45 : 0)
      : withTiming(open ? 45 : 0, TIMINGS.fast);
  }, [open, reduceMotion, expand, rotation]);

  const mainBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }],
  }));

  function handlePress() {
    if (open) {
      setOpen(false);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    onPress();
  }

  function handleLongPress() {
    if (longPressActions.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    setOpen(true);
  }

  const fabColor = color ?? C.tint;
  const wrapStyle = position === 'bottomCenter' ? s.wrapCenter : s.wrapRight;

  return (
    <>
      {/* Backdrop covers the screen when expanded so tap-outside collapses. */}
      {open && (
        <Pressable
          style={s.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close quick actions"
          accessibilityRole="button"
        />
      )}

      <View style={wrapStyle} pointerEvents="box-none">
        {/* Action fan-out (rendered above the main button) */}
        {longPressActions.map((action, i) => {
          const idx = longPressActions.length - i; // 1..N going upward
          const offset = idx * 62; // 62dp per action row

          // Each action animates in with stagger via the same expand value.
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const actionStyle = useAnimatedStyle(() => ({
            opacity: expand.value,
            transform: [{ translateY: -offset * expand.value }],
            pointerEvents: expand.value > 0.5 ? 'auto' : 'none',
          }));

          return (
            <Animated.View key={action.label} style={[s.actionRow, actionStyle]}>
              <View style={[s.actionLabel, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Text style={[s.actionLabelText, { color: C.text }]}>{action.label}</Text>
              </View>
              <Pressable
                style={[s.mini, { backgroundColor: action.color ?? fabColor }]}
                onPress={() => {
                  setOpen(false);
                  Haptics.selectionAsync().catch(() => null);
                  setTimeout(() => action.onPress(), 80);
                }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Ionicons name={action.icon} size={20} color="#fff" />
              </Pressable>
            </Animated.View>
          );
        })}

        {/* Main FAB */}
        <Animated.View style={mainBtnStyle}>
          <Pressable
            style={[s.main, { backgroundColor: fabColor }]}
            onPressIn={() => { scale.value = withSpring(0.92, SPRINGS.snappy); }}
            onPressOut={() => { scale.value = withSpring(1, SPRINGS.snappy); }}
            onPress={handlePress}
            onLongPress={handleLongPress}
            delayLongPress={300}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
          >
            <Ionicons name={icon} size={26} color="#fff" />
          </Pressable>
        </Animated.View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000055',
    zIndex: 50,
  },
  wrapRight: {
    position: 'absolute',
    right: 20,
    bottom: 96, // above tab bar
    alignItems: 'flex-end',
    zIndex: 60,
  },
  wrapCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 32,
    alignItems: 'center',
    zIndex: 60,
  },
  main: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 10,
  },
  actionRow: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionLabel: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
  },
  actionLabelText: { fontSize: 13, fontWeight: '600' },
  mini: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 8,
  },
});
