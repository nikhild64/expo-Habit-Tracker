import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, DevSettings, Modal, Platform, ScrollView, StatusBar, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClockFace } from '@/components/ClockFace';
import { useHabitsStore } from '@/contexts/HabitsContext';
import { useColors, useTheme } from '@/contexts/ThemeContext';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import {
  DEFAULT_QUIET_HOURS,
  loadQuietHours,
  saveQuietHours,
  type QuietHours,
} from '@/lib/habits/quiet-hours';
import { clearDummyData, loadDummyData } from '@/lib/habits/seed';
import {
  getExactAlarmStatus,
  openExactAlarmSettings,
  openSystemSettings,
  requestNotificationPermission,
} from '@/lib/notifications/setup';

const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

// Show the exact-alarm row only on Android 12+ where the permission matters
const NEEDS_EXACT_ALARM_CHECK = Platform.OS === 'android' && (Platform.Version as number) >= 31;

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ label, C }: { label: string; C: ReturnType<typeof useColors> }) {
  return <Text style={{ fontSize: 12, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8, marginBottom: 4, paddingHorizontal: 4 }}>{label}</Text>;
}

// ── Screen ────────────────────────────────────────────────────────────────────

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

export default function SettingsScreen() {
  const C = useColors();
  const { isDark, toggleTheme } = useTheme();
  const { token, permissionStatus, refresh } = usePushNotifications();
  const { habits, restoreHabit, deleteHabit } = useHabitsStore();
  const archivedHabits = habits.filter(h => h.status === 'archived');
  const [quietHours, setQuietHoursState] = useState<QuietHours>(DEFAULT_QUIET_HOURS);
  const [exactAlarmStatus, setExactAlarmStatus] = useState<'not-applicable' | 'granted' | 'revoked'>('not-applicable');
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);
  const [pickerHour, setPickerHour] = useState(0);
  const [pickerMinute, setPickerMinute] = useState(0);

  // Easter egg: tap Version 5× in 10 s to reveal push token
  const [showPushToken, setShowPushToken] = useState(false);
  const [versionTapHint, setVersionTapHint] = useState('');
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleVersionTap() {
    versionTapCount.current += 1;
    const remaining = 5 - versionTapCount.current;

    if (versionTapTimer.current) clearTimeout(versionTapTimer.current);

    if (versionTapCount.current >= 5) {
      versionTapCount.current = 0;
      setVersionTapHint('');
      setShowPushToken(prev => !prev);
    } else {
      setVersionTapHint(remaining === 1 ? 'One more…' : `${remaining} more taps`);
      versionTapTimer.current = setTimeout(() => {
        versionTapCount.current = 0;
        setVersionTapHint('');
      }, 10_000);
    }
  }
  const s = useMemo(() => createStyles(C), [C]);

  useEffect(() => {
    loadQuietHours().then(setQuietHoursState);
    if (NEEDS_EXACT_ALARM_CHECK) {
      getExactAlarmStatus().then(setExactAlarmStatus);
    }
  }, []);

  async function updateQuietHours(patch: Partial<QuietHours>) {
    const next = { ...quietHours, ...patch };
    setQuietHoursState(next);
    await saveQuietHours(next);
  }

  async function handleRequestPermission() {
    const status = await requestNotificationPermission();
    await refresh();
    if (status === 'denied') {
      Alert.alert('Notifications blocked', 'Open system settings to enable notifications.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: openSystemSettings },
      ]);
    }
  }

  async function copyToken() {
    if (!token) return;
    await Clipboard.setStringAsync(token);
    Alert.alert('Copied', 'Push token copied to clipboard.');
  }

  async function resetApp() {
    Alert.alert(
      'Reset App',
      'This will delete all habits, streaks, settings, and quiet hours. The app will restart from the beginning.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            router.replace('/onboarding' as never);
          },
        },
      ],
    );
  }

  const granted = permissionStatus === 'granted';
  const denied = permissionStatus === 'denied';
  const undetermined = !granted && !denied;

  const permIcon = granted ? 'notifications' : denied ? 'notifications-off' : 'notifications-outline';
  const permColor = granted ? C.done : denied ? C.danger : C.streak;
  const permLabel = granted ? 'Enabled' : denied ? 'Denied' : 'Not determined';

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.heading}>Settings</Text>

        {/* ── Appearance ── */}
        <SectionLabel label="Appearance" C={C} />
        <View style={s.card}>
          <View style={s.row}>
            <View style={[s.rowIcon, { backgroundColor: isDark ? '#6366F126' : '#F4F4F5' }]}>
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={16} color={isDark ? C.tint : '#CA8A04'} />
            </View>
            <Text style={s.rowLabel}>Dark Mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ true: C.tint, false: C.border }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ── Notifications ── */}
        <SectionLabel label="Notifications" C={C} />
        <View style={s.card}>
          <View style={[s.row, s.rowBorder]}>
            <View style={[s.rowIcon, { backgroundColor: permColor + '22' }]}>
              <Ionicons name={permIcon as never} size={16} color={permColor} />
            </View>
            <Text style={[s.rowLabel, { color: permColor }]}>Permission</Text>
            <Text style={s.rowValue}>{permLabel}</Text>
          </View>
          {denied && (
            <TouchableOpacity style={s.row} onPress={openSystemSettings} activeOpacity={0.7}>
              <View style={s.rowIcon}><Ionicons name="open-outline" size={16} color={C.textSecondary} /></View>
              <Text style={s.rowLabel}>Enable in System Settings</Text>
              <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
            </TouchableOpacity>
          )}
          {undetermined && (
            <TouchableOpacity style={s.row} onPress={handleRequestPermission} activeOpacity={0.7}>
              <View style={s.rowIcon}><Ionicons name="checkmark-circle-outline" size={16} color={C.textSecondary} /></View>
              <Text style={s.rowLabel}>Allow Notifications</Text>
              <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
            </TouchableOpacity>
          )}

          {/* Precise Reminders — Android 12+ only */}
          {exactAlarmStatus !== 'not-applicable' && (
            <TouchableOpacity
              style={[s.row, exactAlarmStatus === 'revoked' ? s.rowBorderTop : null]}
              onPress={exactAlarmStatus === 'revoked' ? openExactAlarmSettings : undefined}
              activeOpacity={exactAlarmStatus === 'revoked' ? 0.7 : 1}
            >
              <View style={[s.rowIcon, { backgroundColor: exactAlarmStatus === 'revoked' ? C.danger + '22' : C.done + '22' }]}>
                <Ionicons
                  name={exactAlarmStatus === 'revoked' ? 'alarm-outline' : 'alarm'}
                  size={16}
                  color={exactAlarmStatus === 'revoked' ? C.danger : C.done}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Precise Reminders</Text>
                {exactAlarmStatus === 'revoked' && (
                  <Text style={{ fontSize: 11, color: C.danger, marginTop: 1 }}>
                    Tap to fix — reminders may arrive ~1 min late
                  </Text>
                )}
              </View>
              {exactAlarmStatus === 'revoked'
                ? <Ionicons name="chevron-forward" size={14} color={C.danger} />
                : <Text style={[s.rowValue, { color: C.done }]}>On time</Text>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* ── Quiet Hours ── */}
        <SectionLabel label="Quiet Hours" C={C} />
        <View style={s.card}>
          <View style={[s.row, s.rowBorder]}>
            <View style={s.rowIcon}><Ionicons name="moon-outline" size={16} color={C.textSecondary} /></View>
            <Text style={s.rowLabel}>Do Not Disturb</Text>
            <Switch
              value={quietHours.enabled}
              onValueChange={v => updateQuietHours({ enabled: v })}
              trackColor={{ true: C.tint }}
              thumbColor="#fff"
            />
          </View>
          <View style={[s.row, s.rowBorder]}>
            <View style={s.rowIcon}><Ionicons name="time-outline" size={16} color={C.textSecondary} /></View>
            <Text style={s.rowLabel}>Start</Text>
            <TouchableOpacity
              onPress={() => { if (!quietHours.enabled) return; setPickerHour(quietHours.startHour); setPickerMinute(quietHours.startMinute); setActivePicker('start'); }}
              style={[s.timePill, { backgroundColor: C.tintLight }]}
            >
              <Text style={[s.timePillText, { color: quietHours.enabled ? C.tint : C.textMuted }]}>
                {formatTime(quietHours.startHour, quietHours.startMinute)}
              </Text>
              <Ionicons name="chevron-down" size={12} color={quietHours.enabled ? C.tint : C.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={s.row}>
            <View style={s.rowIcon}><Ionicons name="sunny-outline" size={16} color={C.textSecondary} /></View>
            <Text style={s.rowLabel}>End</Text>
            <TouchableOpacity
              onPress={() => { if (!quietHours.enabled) return; setPickerHour(quietHours.endHour); setPickerMinute(quietHours.endMinute); setActivePicker('end'); }}
              style={[s.timePill, { backgroundColor: C.tintLight }]}
            >
              <Text style={[s.timePillText, { color: quietHours.enabled ? C.tint : C.textMuted }]}>
                {formatTime(quietHours.endHour, quietHours.endMinute)}
              </Text>
              <Ionicons name="chevron-down" size={12} color={quietHours.enabled ? C.tint : C.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        {quietHours.enabled && (
          <Text style={s.hint}>
            Reminders and push notifications are silenced between {formatTime(quietHours.startHour, quietHours.startMinute)} and {formatTime(quietHours.endHour, quietHours.endMinute)}.
          </Text>
        )}

        {/* ── Push Token — revealed by version easter egg ── */}
        {showPushToken && !IS_EXPO_GO && (
          <>
            <SectionLabel label="Push Token" C={C} />
            <View style={s.card}>
              {token ? (
                <>
                  <Text style={s.tokenHint}>Your device's push token. Used by the server to send you notifications.</Text>
                  <View style={s.tokenBox}>
                    <Text selectable style={s.tokenText}>{token}</Text>
                  </View>
                  <TouchableOpacity style={s.copyBtn} onPress={copyToken} activeOpacity={0.8}>
                    <Ionicons name="copy-outline" size={15} color={C.tint} />
                    <Text style={[s.copyBtnText, { color: C.tint }]}>Copy Token</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={s.muted}>{granted ? 'Fetching…' : 'Grant notification permission first'}</Text>
              )}
            </View>
          </>
        )}

        {/* ── About — tap Version 5× in 10 s to unlock push token ── */}
        <SectionLabel label="About" C={C} />
        <View style={s.card}>
          <TouchableOpacity style={[s.row, s.rowBorder]} onPress={() => router.push('/about' as never)} activeOpacity={0.7}>
            <View style={[s.rowIcon, { backgroundColor: C.tintLight }]}>
              <Ionicons name="information-circle-outline" size={16} color={C.tint} />
            </View>
            <Text style={s.rowLabel}>About Habitly</Text>
            <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.row, s.rowBorder]} onPress={() => router.push('/privacy' as never)} activeOpacity={0.7}>
            <View style={[s.rowIcon, { backgroundColor: C.tintLight }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color={C.tint} />
            </View>
            <Text style={s.rowLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={handleVersionTap} activeOpacity={0.7}>
            <View style={s.rowIcon}>
              <Ionicons name="phone-portrait-outline" size={16} color={C.textSecondary} />
            </View>
            <Text style={s.rowLabel}>Version</Text>
            <Text style={[s.rowValue, versionTapHint ? { color: C.tint } : null]}>
              {versionTapHint || (showPushToken ? `${Constants.expoConfig?.version ?? '1.0.0'} ●` : (Constants.expoConfig?.version ?? '1.0.0'))}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Developer Tools — revealed by the same version tap easter egg ── */}
        {showPushToken && (
          <>
            <SectionLabel label="Developer Tools" C={C} />
            <View style={s.card}>
              {/* Load dummy data */}
              <TouchableOpacity
                style={[s.row, s.rowBorder]}
                activeOpacity={0.7}
                onPress={() =>
                  Alert.alert(
                    'Load Dummy Data',
                    'This replaces all your habits with 5 seed habits covering 5 months of streak history. The app will reload automatically.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Load & Reload',
                        onPress: async () => {
                          await loadDummyData();
                          DevSettings.reload();
                        },
                      },
                    ],
                  )
                }
              >
                <View style={[s.rowIcon, { backgroundColor: '#F97316' + '22' }]}>
                  <Ionicons name="flask-outline" size={16} color="#F97316" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowLabel}>Load Dummy Data</Text>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                    5 habits · 5 months of streak history
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
              </TouchableOpacity>

              {/* Clear all data */}
              <TouchableOpacity
                style={s.row}
                activeOpacity={0.7}
                onPress={() =>
                  Alert.alert(
                    'Clear All Habits',
                    'Removes all habits from storage and reloads. Use this to reset after testing.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear & Reload',
                        style: 'destructive',
                        onPress: async () => {
                          await clearDummyData();
                          DevSettings.reload();
                        },
                      },
                    ],
                  )
                }
              >
                <View style={[s.rowIcon, { backgroundColor: C.danger + '22' }]}>
                  <Ionicons name="trash-bin-outline" size={16} color={C.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { color: C.danger }]}>Clear All Habits</Text>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                    Reset to empty state
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Archived Habits ── */}
        {archivedHabits.length > 0 && (
          <>
            <SectionLabel label="Archived Habits" C={C} />
            <View style={s.card}>
              {archivedHabits.map((h, i) => (
                <View
                  key={h.id}
                  style={[s.row, i < archivedHabits.length - 1 && s.rowBorder]}
                >
                  <View style={[s.rowIcon, { backgroundColor: h.color + '22' }]}>
                    <Ionicons name={h.icon as never} size={16} color={h.color} />
                  </View>
                  <Text style={[s.rowLabel, { color: C.textSecondary }]} numberOfLines={1}>
                    {h.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => restoreHabit(h.id)}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.tintLight }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: C.tint }}>Restore</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert('Delete habit', `Permanently delete "${h.name}"? This cannot be undone.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteHabit(h.id) },
                      ])
                    }
                    style={{ padding: 4 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color={C.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Danger zone ── */}
        <SectionLabel label="Danger Zone" C={C} />
        <TouchableOpacity style={s.resetBtn} onPress={resetApp} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={18} color={C.danger} />
          <View>
            <Text style={[s.resetTitle, { color: C.danger }]}>Reset App</Text>
            <Text style={s.resetSub}>Deletes all habits, streaks, and settings</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Clock time picker modal ── */}
      <Modal
        visible={activePicker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: C.surface }]}>
            {/* Header */}
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: C.textMuted }]}>
                {activePicker === 'start' ? 'START TIME' : 'END TIME'}
              </Text>
              <TouchableOpacity onPress={() => setActivePicker(null)}>
                <Ionicons name="close" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Clock face */}
            <View style={{ paddingHorizontal: 24, paddingBottom: 8 }}>
              <ClockFace
                hour24={pickerHour}
                minute={pickerMinute}
                onChangeHour={setPickerHour}
                onChangeMinute={setPickerMinute}
                C={C}
              />
            </View>

            {/* Done button */}
            <View style={{ paddingHorizontal: 24, paddingBottom: 32, paddingTop: 16 }}>
              <TouchableOpacity
                style={[s.doneBtn, { backgroundColor: C.tint }]}
                onPress={() => {
                  if (activePicker === 'start') updateQuietHours({ startHour: pickerHour, startMinute: pickerMinute });
                  else updateQuietHours({ endHour: pickerHour, endMinute: pickerMinute });
                  setActivePicker(null);
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                  Confirm {formatTime(pickerHour, pickerMinute)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(C: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    content: { padding: 20, paddingTop: 8, gap: 8, paddingBottom: 48 },
    heading: { fontSize: 30, fontWeight: '700', color: C.text, letterSpacing: -0.5, marginBottom: 12, paddingTop: 8 },

    card: {
      backgroundColor: C.surface,
      borderRadius: 14, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 14, paddingVertical: 4,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    rowBorderTop: { borderTopWidth: 1, borderTopColor: C.border },
    rowIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { flex: 1, fontSize: 15, color: C.text },
    rowValue: { fontSize: 14, color: C.textMuted },

    tokenHint: { fontSize: 13, color: C.textMuted, lineHeight: 18, paddingTop: 10, paddingBottom: 4 },
    tokenBox: { backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 12, marginBottom: 4 },
    tokenText: { fontSize: 11, color: C.text, fontFamily: 'monospace', lineHeight: 18 },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: C.tintLight, marginBottom: 10 },
    copyBtnText: { fontSize: 14, fontWeight: '600' },

    muted: { fontSize: 14, color: C.textMuted, paddingVertical: 12 },
    hint: { fontSize: 12, color: C.textMuted, paddingHorizontal: 4, fontStyle: 'italic' },

    timePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
    timePillText: { fontSize: 14, fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: '#00000070', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 4 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
    modalTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
    doneBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },

    resetBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: C.dangerLight,
      borderRadius: 14, borderWidth: 1, borderColor: C.danger + '40',
      padding: 16,
    },
    resetTitle: { fontSize: 15, fontWeight: '600' },
    resetSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  });
}
