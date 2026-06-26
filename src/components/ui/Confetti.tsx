import { Canvas, Circle, Group } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/lib/ui/a11y';

type Piece = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
  delay: number;
};

const COLORS = ['#FF8B1F', '#10B981', '#6366F1', '#F43F5E', '#FBBF24', '#34D399', '#A78BFA'];

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }

/**
 * Lightweight Skia-rendered confetti burst.
 *
 * Renders nothing when `visible` is false. Call `onDone` after the animation
 * so the parent can unmount and free resources.
 */
export function Confetti({ visible, onDone }: { visible: boolean; onDone?: () => void }) {
  const { width, height } = Dimensions.get('window');
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(0);

  const pieces = useMemo<Piece[]>(() => {
    if (!visible || reduceMotion) return [];
    return Array.from({ length: 40 }, () => ({
      x: width / 2 + rand(-30, 30),
      y: height / 2 - 60,
      dx: rand(-180, 180),
      dy: rand(-300, -120),
      size: rand(4, 8),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: rand(0, 120),
    }));
  }, [visible, reduceMotion, width, height]);

  useEffect(() => {
    if (!visible) {
      opacity.value = 0;
      return;
    }
    // Reduce motion: fire onDone immediately without showing the burst.
    if (reduceMotion) {
      if (onDone) setTimeout(onDone, 50);
      return;
    }
    opacity.value = withTiming(1, { duration: 150 });
    const t = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.quad) });
      if (onDone) setTimeout(onDone, 600);
    }, 900);
    return () => clearTimeout(t);
  }, [visible, reduceMotion, opacity, onDone]);

  const wrapStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!visible || reduceMotion || pieces.length === 0) return null;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, wrapStyle]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group>
            {pieces.map((p, i) => (
              <ConfettiPiece key={i} piece={p} />
            ))}
          </Group>
        </Canvas>
      </View>
    </Animated.View>
  );
}

function ConfettiPiece({ piece }: { piece: Piece }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(piece.delay, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
  }, [piece.delay, t]);

  // We need plain values for Skia Circle (it doesn't accept Reanimated SharedValue directly here),
  // so compute final position once. The opacity fade is driven by the wrap.
  const finalX = piece.x + piece.dx;
  const finalY = piece.y + piece.dy + 200; // gravity

  return (
    <Circle cx={finalX} cy={finalY} r={piece.size} color={piece.color} />
  );
}
