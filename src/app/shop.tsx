import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { useGamification } from '@/contexts/GamificationContext';
import { useColors, useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { ACCENT_PRESETS } from '@/lib/ui/theme';
import type { AccentId } from '@/lib/ui/theme';
import type { Colors } from '@/lib/ui/theme';

const ACCENT_COST = 100;

export default function ShopScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { profile, spendCoins } = useGamification();
  const { accent, unlockedAccents, setAccent, unlockAccent } = useTheme();
  const toast = useToast();
  const coins = profile?.coins ?? 0;

  async function buy(presetId: AccentId, label: string) {
    if (unlockedAccents.includes(presetId)) return;
    if (coins < ACCENT_COST) {
      toast.info(`Need ${ACCENT_COST - coins} more coins to unlock ${label}`);
      return;
    }
    Alert.alert(
      `Unlock ${label}?`,
      `Spend ${ACCENT_COST} coins to permanently unlock this accent color.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Unlock for ${ACCENT_COST}`,
          onPress: async () => {
            const ok = await spendCoins(ACCENT_COST);
            if (!ok) {
              toast.error('Not enough coins — try again after earning more');
              return;
            }
            await unlockAccent(presetId);
            setAccent(presetId);
            toast.success(`${label} unlocked!`);
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="close" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.title}>Cosmetics</Text>
        <View style={s.coinPill}>
          <Ionicons name="cash" size={14} color="#F59E0B" />
          <Text style={s.coinText}>{coins}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Card>
          <View style={{ alignItems: 'center', paddingVertical: 12, gap: 8 }}>
            <Ionicons name="color-palette-outline" size={36} color={C.tint} />
            <Text style={[s.heroTitle, { color: C.text }]}>Personalize your app</Text>
            <Text style={[s.heroBody, { color: C.textMuted }]}>
              Earn coins from completing habits and unlocking achievements. Spend them on accent themes here.
            </Text>
          </View>
        </Card>

        <Text style={[s.sectionLabel, { color: C.textMuted }]}>ACCENT THEMES</Text>
        <View style={s.grid}>
          {ACCENT_PRESETS.map(preset => {
            const isUnlocked = unlockedAccents.includes(preset.id);
            const isActive   = accent === preset.id;
            return (
              <Card key={preset.id} style={{ flexBasis: '47%', flexGrow: 1 }}>
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <View style={[s.swatch, { backgroundColor: preset.tint }]}>
                    {isUnlocked
                      ? <Ionicons name={isActive ? 'checkmark' : 'color-fill-outline'} size={20} color="#fff" />
                      : <Ionicons name="lock-closed" size={18} color="#fff" />}
                  </View>
                  <Text style={[s.themeLabel, { color: C.text }]}>{preset.label}</Text>
                  {isUnlocked ? (
                    <Button
                      label={isActive ? 'Active' : 'Apply'}
                      onPress={() => setAccent(preset.id as AccentId)}
                      variant={isActive ? 'ghost' : 'secondary'}
                      disabled={isActive}
                    />
                  ) : (
                    <Button
                      label={`${ACCENT_COST} coins`}
                      icon="cash-outline"
                      onPress={() => buy(preset.id as AccentId, preset.label)}
                      variant="primary"
                    />
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(C: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 17, fontWeight: '700', color: C.text },
    coinPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
    coinText: { fontSize: 14, fontWeight: '800', color: '#F59E0B' },
    content: { padding: 16, gap: 12, paddingBottom: 48 },
    heroTitle: { fontSize: 17, fontWeight: '700' },
    heroBody: { fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 8 },
    sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 6, marginLeft: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    swatch: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    themeLabel: { fontSize: 14, fontWeight: '700' },
  });
}
