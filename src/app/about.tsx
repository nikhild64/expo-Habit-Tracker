import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColors } from '@/contexts/ThemeContext';

const FEATURES = [
  { icon: 'checkmark-circle-outline', text: 'Build daily and weekly habits' },
  { icon: 'flame-outline',            text: 'Track streaks and stay motivated' },
  { icon: 'notifications-outline',    text: 'Local reminders — no internet needed' },
  { icon: 'cloud-outline',            text: 'Push nudges from the server when streaks are at risk' },
  { icon: 'moon-outline',             text: 'Quiet hours — silence reminders while you sleep' },
  { icon: 'sunny-outline',            text: 'Light and dark theme' },
];

export default function AboutScreen() {
  const C = useColors();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>About</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* App identity */}
        <View style={s.hero}>
          <View style={[s.iconWrap, { backgroundColor: C.tint }]}>
            <Ionicons name="leaf" size={40} color="#fff" />
          </View>
          <Text style={[s.appName, { color: C.text }]}>Habitly</Text>
          <Text style={[s.tagline, { color: C.textMuted }]}>Build streaks. Stay consistent.</Text>
          <View style={[s.versionPill, { backgroundColor: C.surfaceAlt }]}>
            <Text style={[s.versionText, { color: C.textMuted }]}>Version {version}</Text>
          </View>
        </View>

        {/* Description */}
        <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[s.cardTitle, { color: C.text }]}>What is Habitly?</Text>
          <Text style={[s.cardBody, { color: C.textSecondary }]}>
            Habitly helps you build lasting habits through daily reminders, streak tracking,
            and gentle nudges. Whether you want to drink more water, exercise, read, or meditate —
            Habitly keeps you on track without getting in your way.
          </Text>
        </View>

        {/* Features */}
        <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[s.cardTitle, { color: C.text }]}>Features</Text>
          {FEATURES.map((f, i) => (
            <View
              key={f.text}
              style={[s.featureRow, i < FEATURES.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}
            >
              <View style={[s.featureIcon, { backgroundColor: C.tintLight }]}>
                <Ionicons name={f.icon as never} size={16} color={C.tint} />
              </View>
              <Text style={[s.featureText, { color: C.textSecondary }]}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Built with */}
        <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[s.cardTitle, { color: C.text }]}>Built with</Text>
          <Text style={[s.cardBody, { color: C.textSecondary }]}>
            Habitly is built with React Native and Expo. Local reminders use Expo Notifications.
            Push notifications are delivered via Expo's push service and Firebase Cloud Messaging.
            All habit data is stored privately on your device.
          </Text>
        </View>

        {/* Legal links */}
        <TouchableOpacity
          style={[s.legalRow, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={() => router.push('/privacy' as never)}
          activeOpacity={0.7}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color={C.tint} />
          <Text style={[s.legalText, { color: C.text }]}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
        </TouchableOpacity>

        <Text style={[s.footer, { color: C.textMuted }]}>
          © {new Date().getFullYear()} Habitly. All rights reserved.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '600' },

  content: { padding: 20, gap: 14, paddingBottom: 48 },

  hero: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  iconWrap: { width: 80, height: 80, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  appName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontSize: 15 },
  versionPill: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 4 },
  versionText: { fontSize: 13, fontWeight: '500' },

  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  cardBody: { fontSize: 14, lineHeight: 22 },

  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  featureIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1, fontSize: 14, lineHeight: 20 },

  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 16 },
  legalText: { flex: 1, fontSize: 15, fontWeight: '500' },

  footer: { textAlign: 'center', fontSize: 12, paddingTop: 8 },
});
