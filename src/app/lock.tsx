import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useAppLock } from '@/contexts/AppLockContext';
import { useColors } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import type { Colors } from '@/lib/ui/theme';

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['bio', '0', 'back'],
];

type Mode = 'setup' | 'confirm' | 'verify';

export default function LockScreen() {
  const C = useColors();
  const s = useMemo(() => createStyles(C), [C]);
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const { prefs, unlock, setPin, verifyPin, tryBiometric, clearLock, updatePrefs } = useAppLock();
  const toast = useToast();
  const isSetupFlow = setup === '1';

  const [mode, setMode] = useState<Mode>(isSetupFlow ? (prefs.enabled ? 'verify' : 'setup') : 'verify');
  const [pin, setLocalPin] = useState('');
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);

  useEffect(() => {
    LocalAuthentication.hasHardwareAsync().then(async hw => {
      if (!hw) return;
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricSupported(enrolled);
    });
  }, []);

  // Auto-trigger biometric on mount when verifying and biometrics enabled
  useEffect(() => {
    if (mode !== 'verify' || isSetupFlow) return;
    if (!prefs.biometricEnabled || !biometricSupported) return;
    runBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricSupported, mode]);

  async function runBiometric() {
    const ok = await tryBiometric();
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      unlock();
      router.replace('/(tabs)' as never);
    }
  }

  function pressDigit(d: string) {
    if (pin.length >= 4) return;
    Haptics.selectionAsync().catch(() => null);
    const next = pin + d;
    setLocalPin(next);
    setError(null);
    if (next.length === 4) {
      setTimeout(() => handleComplete(next), 100);
    }
  }

  function pressBack() {
    Haptics.selectionAsync().catch(() => null);
    setLocalPin(p => p.slice(0, -1));
  }

  async function handleComplete(completed: string) {
    if (mode === 'setup') {
      setFirstPin(completed);
      setLocalPin('');
      setMode('confirm');
      return;
    }
    if (mode === 'confirm') {
      if (firstPin === completed) {
        await setPin(completed);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
        toast.success('App lock enabled — PIN set');
        unlock();
        router.replace('/(tabs)' as never);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
        setError("PINs don't match. Try again.");
        setFirstPin(null);
        setLocalPin('');
        setMode('setup');
      }
      return;
    }
    // verify mode
    const ok = await verifyPin(completed);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      unlock();
      router.replace('/(tabs)' as never);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
      setError('Wrong PIN. Try again.');
      setLocalPin('');
    }
  }

  function pressKey(key: string) {
    if (key === 'back') return pressBack();
    if (key === 'bio') return runBiometric();
    pressDigit(key);
  }

  const title =
    mode === 'setup'   ? 'Set a 4-digit PIN' :
    mode === 'confirm' ? 'Confirm your PIN' :
    'Unlock Habitly';

  const subtitle =
    mode === 'setup'   ? 'Use this PIN to unlock the app.' :
    mode === 'confirm' ? 'Re-enter the same PIN.' :
    biometricSupported && prefs.biometricEnabled ? 'Use biometric or enter PIN.' : 'Enter your PIN.';

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.body}>
        <View style={s.header}>
          <View style={[s.logoWrap, { backgroundColor: C.tint }]}>
            <Ionicons name="lock-closed" size={32} color="#fff" />
          </View>
          <Text style={[s.title, { color: C.text }]}>{title}</Text>
          <Text style={[s.sub, { color: C.textMuted }]}>{subtitle}</Text>
        </View>

        <View style={s.dotsRow}>
          {[0, 1, 2, 3].map(i => (
            <View
              key={i}
              style={[
                s.dot,
                { borderColor: C.border },
                i < pin.length && { backgroundColor: C.tint, borderColor: C.tint },
                error && { borderColor: C.danger },
              ]}
            />
          ))}
        </View>

        {error && <Text style={[s.error, { color: C.danger }]}>{error}</Text>}

        <View style={s.keypad}>
          {KEYPAD.map((row, ri) => (
            <View key={ri} style={s.kpRow}>
              {row.map(key => {
                if (key === 'bio' && (!biometricSupported || mode !== 'verify' || isSetupFlow)) {
                  return <View key={key} style={s.kpKeyEmpty} />;
                }
                return (
                  <Pressable
                    key={key}
                    onPress={() => pressKey(key)}
                    style={({ pressed }) => [
                      s.kpKey,
                      { backgroundColor: pressed ? C.surfaceHover : C.surface, borderColor: C.border },
                    ]}
                  >
                    {key === 'back'
                      ? <Ionicons name="backspace-outline" size={24} color={C.textSecondary} />
                      : key === 'bio'
                      ? <Ionicons name="finger-print" size={26} color={C.tint} />
                      : <Text style={[s.kpDigit, { color: C.text }]}>{key}</Text>
                    }
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* Setup-flow actions */}
        {isSetupFlow && mode === 'verify' && prefs.enabled && (
          <View style={{ gap: 8, marginTop: 8 }}>
            <Button
              label="Change PIN"
              variant="secondary"
              icon="key-outline"
              onPress={() => { setMode('setup'); setLocalPin(''); setError(null); }}
            />
            <Button
              label="Disable App Lock"
              variant="ghost"
              icon="lock-open-outline"
              onPress={() => {
                Alert.alert(
                  'Disable lock?',
                  'Your data will no longer require a PIN to view.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Disable', style: 'destructive', onPress: async () => {
                      await clearLock();
                      router.back();
                    } },
                  ],
                );
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.textSecondary }}>Use biometric</Text>
              <Pressable
                onPress={() => updatePrefs({ biometricEnabled: !prefs.biometricEnabled })}
                style={{
                  width: 48, height: 28, borderRadius: 14, padding: 2,
                  backgroundColor: prefs.biometricEnabled ? C.tint : C.border,
                  justifyContent: 'center',
                  alignItems: prefs.biometricEnabled ? 'flex-end' : 'flex-start',
                }}
              >
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }} />
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function createStyles(C: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    body: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 32, paddingVertical: 24 },
    header: { alignItems: 'center', gap: 12 },
    logoWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 22, fontWeight: '700' },
    sub: { fontSize: 14, textAlign: 'center' },
    dotsRow: { flexDirection: 'row', gap: 18 },
    dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
    error: { fontSize: 13, fontWeight: '600', marginTop: 6 },
    keypad: { gap: 10, alignSelf: 'stretch' },
    kpRow: { flexDirection: 'row', justifyContent: 'space-between' },
    kpKey: {
      width: 76, height: 76, borderRadius: 38, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    kpKeyEmpty: { width: 76, height: 76 },
    kpDigit: { fontSize: 28, fontWeight: '600' },
  });
}
