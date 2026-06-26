import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Circle, Svg } from 'react-native-svg';

import { useColors } from '@/contexts/ThemeContext';
import { TIMINGS } from '@/lib/ui/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  progress: number; // 0–1
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  label?: string;
};

/**
 * Smoothly-animated circular progress indicator built on react-native-svg
 * (already a peer dep of victory-native, no new install required).
 */
export function ProgressRing({
  progress,
  size = 64,
  stroke = 6,
  color,
  trackColor,
  label,
}: Props) {
  const C = useColors();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ringColor = color ?? C.tint;
  const trackCol = trackColor ?? C.border;

  const sv = useSharedValue(0);
  useEffect(() => {
    sv.value = withTiming(Math.max(0, Math.min(1, progress)), TIMINGS.slow);
  }, [progress, sv]);

  const animProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - sv.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackCol}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}, ${circumference}`}
          animatedProps={animProps}
          // 12 o'clock start
          originX={size / 2}
          originY={size / 2}
          rotation={-90}
        />
      </Svg>
      {label !== undefined && (
        <Text style={[styles.label, { color: ringColor }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
