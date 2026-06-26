/**
 * Long-press context menu.
 *
 * Wraps any child. On long-press: shows a centered card menu with icon + label
 * rows. Backdrop dims; tap-anywhere-else dismisses.
 *
 * Layout choice: centered modal rather than anchored-to-press. Anchored menus
 * need precise measurement + clamping to screen edges and can flicker on
 * Android; centered + dim is calmer and works on every screen size.
 *
 * Disable via the `disabled` prop while interactions like drag are active so
 * long-press doesn't fire on the drag gesture's underlying press.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import type { ComponentProps, ReactElement } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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

export type ContextMenuItem = {
  icon?: IoniconName;
  label: string;
  destructive?: boolean;
  /** When true, the row is muted and not pressable. */
  disabled?: boolean;
  onPress: () => void;
};

type Props = {
  items: ContextMenuItem[];
  children: ReactElement;
  /** Skip the long-press handler entirely (e.g. while drag/edit modes are on). */
  disabled?: boolean;
  /** Optional heading shown above the items. */
  title?: string;
};

export function ContextMenu({ items, children, disabled, title }: Props) {
  const C = useColors();
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(false);

  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (open) {
      if (reduceMotion) {
        scale.value = 1;
        opacity.value = 1;
      } else {
        scale.value = withSpring(1, SPRINGS.snappy);
        opacity.value = withTiming(1, TIMINGS.fast);
      }
    } else {
      scale.value = reduceMotion ? 0.92 : withTiming(0.92, TIMINGS.fast);
      opacity.value = reduceMotion ? 0 : withTiming(0, TIMINGS.fast);
    }
  }, [open, reduceMotion, scale, opacity]);

  const menuStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  function handleLongPress() {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    setOpen(true);
  }

  function handleItem(item: ContextMenuItem) {
    if (item.disabled) return;
    Haptics.selectionAsync().catch(() => null);
    setOpen(false);
    // Run the action after the close animation so any nav transitions feel smooth.
    setTimeout(() => item.onPress(), 120);
  }

  // Inject onLongPress into the child by cloning. We expect a single React element child.
  const wrapped = (() => {
    if (!children) return children;
    // Use cloneElement to add the long-press handler without breaking child props.
    // The child must forward `onLongPress` (most Touchables / Pressables do by default).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cloneElement = (require('react').cloneElement as any);
    return cloneElement(children, {
      onLongPress: handleLongPress,
      delayLongPress: 400,
    });
  })();

  return (
    <>
      {wrapped}
      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Animated.View
            style={[s.menu, { backgroundColor: C.surface, borderColor: C.border }, menuStyle]}
            // Stop press bubbling so taps on the menu itself don't dismiss.
            onStartShouldSetResponder={() => true}
          >
            {title && (
              <Text style={[s.title, { color: C.textMuted }]}>{title.toUpperCase()}</Text>
            )}
            {items.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  s.item,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
                  item.disabled && { opacity: 0.4 },
                ]}
                activeOpacity={0.7}
                onPress={() => handleItem(item)}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
              >
                {item.icon && (
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={item.destructive ? C.danger : C.textSecondary}
                  />
                )}
                <Text
                  style={[
                    s.itemLabel,
                    { color: item.destructive ? C.danger : C.text },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000080',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  menu: {
    minWidth: 260,
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 14,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemLabel: { fontSize: 15, fontWeight: '600', flex: 1 },
});
