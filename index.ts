// Custom entry point — required because we need to register the Android
// home-screen widget task handler alongside the standard expo-router entry.
// See https://saleksovski.github.io/react-native-android-widget/docs/api/register-widget-task-handler
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

// expo-router/entry has the side effect of registering the root component.
// We import it for its side effect so this file remains the package "main".
import 'expo-router/entry';

if (Platform.OS === 'android') {
  // Lazy import to avoid loading the widget code on iOS.
  const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
