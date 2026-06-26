import {
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/contexts/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Disable keyboard-avoiding wrapper (e.g. when the sheet has no inputs). */
  noKeyboardAvoid?: boolean;
};

/**
 * Bottom-anchored modal sheet with built-in keyboard avoidance.
 *
 * Keyboard handling notes (important):
 *   On Android, <Modal> opens a separate window whose softInputMode isn't
 *   driven by the activity's adjustResize. The two things that make
 *   <KeyboardAvoidingView> actually work inside this window are:
 *     1. `statusBarTranslucent` on the Modal — opts into the activity window
 *        so the keyboard inset is observed
 *     2. KAV must wrap the FULL overlay with flex:1, with behavior="padding"
 *        on both platforms (more reliable than "height")
 *   Without these, the keyboard slides up OVER the sheet on Android.
 */
export function Sheet({ visible, onClose, children, noKeyboardAvoid }: Props) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  // Bottom padding respects the home indicator / gesture bar.
  const bottomPad = Math.max(insets.bottom + 12, 24);

  const inner = (
    <View style={styles.overlay}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: C.surface, paddingBottom: bottomPad }]}>
        <View style={[styles.handle, { backgroundColor: C.border }]} />
        {children}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {noKeyboardAvoid ? (
        inner
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          {inner}
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000075' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    // paddingBottom set inline via useSafeAreaInsets in the component body.
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 14,
  },
});
