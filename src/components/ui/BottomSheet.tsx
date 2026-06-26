/**
 * Snap-point bottom sheet built on Reanimated 4 + Gesture Handler 2.
 *
 * Behavior:
 *  - Sheet has configurable snap points expressed as 0..1 fractions of screen
 *    height (default [0.4, 0.9]).
 *  - Pan gesture on the drag handle moves the sheet; release snaps to the
 *    nearest point with velocity bias.
 *  - Drag below the smallest snap × 0.5 OR a fast downward fling closes it.
 *  - Backdrop fades in/out proportionally to current sheet height; tap to close.
 *  - Respects `useReduceMotion()` (no spring, immediate snap to target).
 *
 * Keyboard handling mirrors `Sheet.tsx` — `statusBarTranslucent` + KAV wrap.
 *
 * NOTE: the pan handle is intentionally only the top strip so children with
 * scrollable content can claim their own gestures freely.
 */
import { useEffect } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ReactNode } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/contexts/ThemeContext';
import { useReduceMotion } from '@/lib/ui/a11y';
import { SPRINGS, TIMINGS } from '@/lib/ui/motion';

const SCREEN_H = Dimensions.get('window').height;

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Snap heights as fractions of screen height. Ascending. */
  snapPoints?: number[];
  /** Initial snap index when opened. */
  initialSnap?: number;
  /** Disable the keyboard-avoiding wrapper (for content with no inputs). */
  noKeyboardAvoid?: boolean;
};

export function BottomSheet({
  visible,
  onClose,
  children,
  snapPoints = [0.4, 0.9],
  initialSnap = 0,
  noKeyboardAvoid,
}: Props) {
  const C = useColors();
  const reduceMotion = useReduceMotion();

  const heightPx = snapPoints.map(p => Math.round(p * SCREEN_H));
  const maxHeight = heightPx[heightPx.length - 1];
  const initialHeight = heightPx[initialSnap] ?? heightPx[0];

  const sheetHeight = useSharedValue(0);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      sheetHeight.value = reduceMotion
        ? initialHeight
        : withSpring(initialHeight, SPRINGS.smooth);
    } else {
      sheetHeight.value = reduceMotion
        ? 0
        : withTiming(0, TIMINGS.fast);
    }
  }, [visible, initialHeight, reduceMotion, sheetHeight]);

  const pan = Gesture.Pan()
    .onStart(() => {
      dragStart.value = sheetHeight.value;
    })
    .onUpdate(e => {
      const next = dragStart.value - e.translationY;
      sheetHeight.value = Math.max(0, Math.min(SCREEN_H * 0.95, next));
    })
    .onEnd(e => {
      const velocity = -e.velocityY; // upward positive
      const projected = sheetHeight.value + velocity * 0.1;

      // Close if dragged well below smallest snap or flung downward.
      const minSnap = heightPx[0];
      if (projected < minSnap * 0.5 || velocity < -1500) {
        sheetHeight.value = withTiming(0, TIMINGS.fast, finished => {
          if (finished) runOnJS(onClose)();
        });
        return;
      }

      // Snap to nearest point.
      let nearest = heightPx[0];
      let nearestDist = Math.abs(heightPx[0] - projected);
      for (let i = 1; i < heightPx.length; i++) {
        const d = Math.abs(heightPx[i] - projected);
        if (d < nearestDist) {
          nearest = heightPx[i];
          nearestDist = d;
        }
      }
      sheetHeight.value = withSpring(nearest, SPRINGS.smooth);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      sheetHeight.value,
      [0, maxHeight],
      [0, 0.6],
      Extrapolation.CLAMP,
    ),
  }));

  const inner = (
    <View style={s.root}>
      <Animated.View style={[s.backdrop, backdropStyle]} pointerEvents={visible ? 'auto' : 'none'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[s.sheet, { backgroundColor: C.surface }, sheetStyle]}>
        <GestureDetector gesture={pan}>
          <View style={s.handleArea}>
            <View style={[s.handle, { backgroundColor: C.border }]} />
          </View>
        </GestureDetector>
        <View style={{ flex: 1 }}>{children}</View>
      </Animated.View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {noKeyboardAvoid ? (
        inner
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
          {inner}
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: { width: 40, height: 4, borderRadius: 2 },
});
