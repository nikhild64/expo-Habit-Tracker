import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors, useTheme } from '@/contexts/ThemeContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(focused: boolean, active: IoniconName, inactive: IoniconName) {
  return function TabIcon({ color }: { color: string }) {
    return <Ionicons name={focused ? active : inactive} size={22} color={color} />;
  };
}

/**
 * Glassmorphism tab bar — sits over scrolled content with a frosted blur.
 * On Android < API 31 the blur degrades gracefully to the tinted overlay
 * (so the bar is still readable, just less translucent).
 */
function GlassTabBarBackground() {
  const C = useColors();
  const { isDark } = useTheme();
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 70 : 90}
        tint={Platform.OS === 'ios' ? 'systemMaterial' : isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      {/* Soft tint overlay so labels stay legible against any background */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#0F0F14C0' : '#FFFFFFC0' }]}
      />
      {/* Hairline top border */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.tabBorder }}
      />
    </View>
  );
}

export default function TabLayout() {
  const C = useColors();
  const insets = useSafeAreaInsets();

  // Tab bar height = icon+label area + system inset (gesture bar / home indicator)
  const TAB_CONTENT_HEIGHT = 56;
  const tabBarHeight = TAB_CONTENT_HEIGHT + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.tint,
        tabBarInactiveTintColor: C.textMuted,
        tabBarBackground: () => <GlassTabBarBackground />,
        tabBarStyle: {
          // Transparent so the BlurView background shows through.
          backgroundColor: 'transparent',
          position: 'absolute',
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: tabBarHeight,
          paddingBottom: insets.bottom > 0 ? insets.bottom : Platform.OS === 'ios' ? 16 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 0.1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused, color }) =>
            tabIcon(focused, 'checkmark-circle', 'checkmark-circle-outline')({ color }),
        }}
      />
      <Tabs.Screen
        name="streaks"
        options={{
          title: 'Progress',
          tabBarIcon: ({ focused, color }) =>
            tabIcon(focused, 'bar-chart', 'bar-chart-outline')({ color }),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) =>
            tabIcon(focused, 'person-circle', 'person-circle-outline')({ color }),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused, color }) =>
            tabIcon(focused, 'settings', 'settings-outline')({ color }),
        }}
      />
    </Tabs>
  );
}
