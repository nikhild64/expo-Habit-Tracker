import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/contexts/ThemeContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(focused: boolean, active: IoniconName, inactive: IoniconName) {
  return function TabIcon({ color }: { color: string }) {
    return <Ionicons name={focused ? active : inactive} size={22} color={color} />;
  };
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
        tabBarStyle: {
          backgroundColor: C.tabBar,
          borderTopWidth: 1,
          borderTopColor: C.tabBorder,
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
