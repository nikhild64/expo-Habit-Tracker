/**
 * Non-blocking confirmation card — softer alternative to `Alert.alert()` for
 * reversible / non-destructive prompts (e.g. "Pause habit?").
 *
 * Renders as a bottom-anchored card with up to 2 buttons. Auto-dismisses if
 * the user taps outside or after `autoCloseMs` (default off).
 *
 * For destructive actions like "Delete habit", keep using `Alert.alert` so the
 * OS treats it with appropriate weight.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/contexts/ThemeContext';
import { useReduceMotion } from '@/lib/ui/a11y';
import { SPRINGS, TIMINGS } from '@/lib/ui/motion';
import { Button } from './Button';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string | ReactNode;
  icon?: IoniconName;
  iconColor?: string;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  /** Auto-close after N ms with no decision (0 = disabled). */
  autoCloseMs?: number;
};

export function Confirmation({
  visible,
  onClose,
  title,
  message,
  icon = 'help-circle',
  iconColor,
  confirmLabel,
  onConfirm,
  cancelLabel = 'Cancel',
  autoCloseMs = 0,
}: Props) {
  const C = useColors();
  const reduceMotion = useReduceMotion();
  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      if (reduceMotion) {
        translateY.value = 0;
        opacity.value = 1;
      } else {
        translateY.value = withSpring(0, SPRINGS.smooth);
        opacity.value = withTiming(1, TIMINGS.fast);
      }
      Haptics.selectionAsync().catch(() => null);
      if (autoCloseMs > 0) {
        const t = setTimeout(onClose, autoCloseMs);
        return () => clearTimeout(t);
      }
    } else {
      if (reduceMotion) {
        translateY.value = 40;
        opacity.value = 0;
      } else {
        translateY.value = withTiming(40, TIMINGS.fast);
        opacity.value = withTiming(0, TIMINGS.fast);
      }
    }
  }, [visible, autoCloseMs, onClose, reduceMotion, translateY, opacity]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <SafeAreaView edges={['bottom']} style={s.safe} pointerEvents="box-none">
          <Animated.View
            style={[s.card, { backgroundColor: C.surface, borderColor: C.border }, cardStyle]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[s.iconWrap, { backgroundColor: (iconColor ?? C.tint) + '22' }]}>
              <Ionicons name={icon} size={24} color={iconColor ?? C.tint} />
            </View>
            <Text style={[s.title, { color: C.text }]}>{title}</Text>
            {typeof message === 'string'
              ? <Text style={[s.message, { color: C.textMuted }]}>{message}</Text>
              : message}
            <View style={s.actions}>
              <Button label={cancelLabel} variant="secondary" onPress={onClose} fullWidth />
              <Button
                label={confirmLabel}
                onPress={() => { onConfirm(); onClose(); }}
                fullWidth
                hapticImpact="medium"
              />
            </View>
          </Animated.View>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' },
  safe: { paddingHorizontal: 16, paddingBottom: 16 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 14,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 12 },
});
