import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/contexts/ThemeContext';
import { Button } from './Button';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body?: string;
  primaryAction?: { label: string; onPress: () => void; icon?: ComponentProps<typeof Ionicons>['name'] };
  secondaryAction?: { label: string; onPress: () => void; icon?: ComponentProps<typeof Ionicons>['name'] };
};

export function EmptyState({ icon, title, body, primaryAction, secondaryAction }: Props) {
  const C = useColors();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: C.surfaceAlt }]}>
        <Ionicons name={icon} size={36} color={C.textMuted} />
      </View>
      <Text style={[styles.title, { color: C.text }]}>{title}</Text>
      {body && <Text style={[styles.body, { color: C.textMuted }]}>{body}</Text>}
      {primaryAction && (
        <View style={{ marginTop: 6 }}>
          <Button label={primaryAction.label} icon={primaryAction.icon} onPress={primaryAction.onPress} />
        </View>
      )}
      {secondaryAction && (
        <Button
          label={secondaryAction.label}
          icon={secondaryAction.icon}
          onPress={secondaryAction.onPress}
          variant="secondary"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 56, gap: 10 },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24, maxWidth: 360 },
});
