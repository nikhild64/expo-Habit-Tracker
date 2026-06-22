import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColors } from '@/contexts/ThemeContext';

const LAST_UPDATED = 'June 22, 2026';

type Section = { title: string; body: string };

const SECTIONS: Section[] = [
  {
    title: '1. Information We Collect',
    body:
      'Habitly stores your habit data (names, icons, reminder times, completion history, and streaks) ' +
      'locally on your device using AsyncStorage. This data never leaves your device unless you explicitly ' +
      'use a backup feature.\n\n' +
      'When push notifications are enabled, your device\'s Expo Push Token is registered with our ' +
      'notification server so we can send you streak nudges and reminders. This token is a randomly ' +
      'generated identifier and does not contain any personally identifiable information.',
  },
  {
    title: '2. How We Use Your Information',
    body:
      'Your habit data is used solely to display your habits, track streaks, and schedule local ' +
      'reminders on your device.\n\n' +
      'Your push token is used only to deliver notifications you have opted in to receive (such as ' +
      'streak nudges). We do not share your push token with any advertising networks or third-party ' +
      'analytics services.',
  },
  {
    title: '3. Third-Party Services',
    body:
      'Habitly uses the following third-party services:\n\n' +
      '• Expo Notifications — delivers push notifications via Expo\'s push infrastructure.\n' +
      '• Firebase Cloud Messaging (FCM) — used by Expo on Android as the underlying push delivery ' +
      'mechanism. FCM is a service provided by Google. Please refer to Google\'s Privacy Policy for ' +
      'information on how FCM handles notification data.\n\n' +
      'These services receive only your push token and the notification payload (title, body, and ' +
      'a habit identifier). No personal data such as your name, email, or location is transmitted.',
  },
  {
    title: '4. Data Storage & Security',
    body:
      'All habit data is stored locally on your device and is subject to your device\'s built-in ' +
      'security (e.g. screen lock, encryption). Push tokens are stored on our notification server ' +
      'hosted on a cloud provider and are protected by API key authentication.\n\n' +
      'We retain push tokens only as long as your app is installed and active. Tokens are ' +
      'automatically removed from our server when the device reports them as no longer valid ' +
      '(DeviceNotRegistered error).',
  },
  {
    title: '5. Your Rights & Data Deletion',
    body:
      'You can delete all locally stored habit data at any time using the Reset App option in ' +
      'Settings → Danger Zone. This permanently erases all habits, streaks, and settings from ' +
      'your device.\n\n' +
      'Uninstalling the app removes all locally stored data. Your push token will be automatically ' +
      'cleaned up from our server the next time a send attempt is made.',
  },
  {
    title: '6. Children\'s Privacy',
    body:
      'Habitly is not directed at children under the age of 13. We do not knowingly collect ' +
      'personal information from children. If you believe a child has used the app and you have ' +
      'concerns, please contact us.',
  },
  {
    title: '7. Changes to This Policy',
    body:
      'We may update this Privacy Policy from time to time. Any changes will be reflected with an ' +
      'updated "Last updated" date at the top of this page. Continued use of the app after changes ' +
      'are posted constitutes your acceptance of the revised policy.',
  },
  {
    title: '8. Contact',
    body:
      'If you have any questions or concerns about this Privacy Policy, please contact us at:\n\n' +
      'nikhildhawan.dev@gmail.com',
  },
];

export default function PrivacyScreen() {
  const C = useColors();

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <View style={[s.introCard, { backgroundColor: C.tintLight }]}>
          <Ionicons name="shield-checkmark" size={22} color={C.tint} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.introTitle, { color: C.tint }]}>Your privacy matters</Text>
            <Text style={[s.introSub, { color: C.tint }]}>Last updated: {LAST_UPDATED}</Text>
          </View>
        </View>

        <Text style={[s.intro, { color: C.textSecondary }]}>
          This Privacy Policy explains how Habitly ("we", "our", or "the app") collects,
          uses, and protects information when you use the app. We are committed to being
          transparent about our practices.
        </Text>

        {/* Sections */}
        {SECTIONS.map((sec) => (
          <View key={sec.title} style={[s.section, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>{sec.title}</Text>
            <Text style={[s.sectionBody, { color: C.textSecondary }]}>{sec.body}</Text>
          </View>
        ))}

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

  content: { padding: 20, gap: 12, paddingBottom: 48 },

  introCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14 },
  introTitle: { fontSize: 14, fontWeight: '700' },
  introSub: { fontSize: 12, opacity: 0.8 },

  intro: { fontSize: 14, lineHeight: 22 },

  section: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  sectionBody: { fontSize: 14, lineHeight: 22 },

  footer: { textAlign: 'center', fontSize: 12, paddingTop: 8 },
});
