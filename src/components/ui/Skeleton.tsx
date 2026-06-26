import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/contexts/ThemeContext';

type Props = {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: ViewStyle;
};

export function Skeleton({ height = 16, width = '100%', radius = 8, style }: Props) {
  const C = useColors();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.base,
        { height, width: width as number, borderRadius: radius, backgroundColor: C.surfaceAlt },
        animStyle,
        style,
      ]}
    />
  );
}

export function SkeletonGroup() {
  return (
    <View style={{ gap: 12, padding: 16 }}>
      <Skeleton height={28} width="60%" />
      <Skeleton height={14} width="40%" />
      <View style={{ height: 8 }} />
      <Skeleton height={64} />
      <Skeleton height={64} />
      <Skeleton height={64} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});
