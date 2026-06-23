import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import SpInAppUpdates, {
  IAUInstallStatus,
  IAUUpdateKind,
  type StatusUpdateEvent,
} from 'sp-react-native-in-app-updates';

const inAppUpdates = new SpInAppUpdates(false);

/**
 * Checks Google Play for a pending update on Android.
 * Uses FLEXIBLE mode — the update downloads silently in the background.
 * When download finishes, prompts the user to restart and apply it.
 */
export function useInAppUpdate() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let removeListener: (() => void) | null = null;

    async function checkForUpdate() {
      try {
        const result = await inAppUpdates.checkNeedsUpdate();
        if (!result.shouldUpdate) return;

        const onStatusUpdate = (status: StatusUpdateEvent) => {
          if (status.status === IAUInstallStatus.DOWNLOADED) {
            Alert.alert(
              'Update Ready',
              'A new version of Habitly has been downloaded. Restart now to apply it.',
              [
                { text: 'Later', style: 'cancel' },
                {
                  text: 'Restart',
                  onPress: () => inAppUpdates.installUpdate(),
                },
              ],
            );
          }
        };

        inAppUpdates.addStatusUpdateListener(onStatusUpdate);
        removeListener = () => inAppUpdates.removeStatusUpdateListener(onStatusUpdate);

        await inAppUpdates.startUpdate({ updateType: IAUUpdateKind.FLEXIBLE });
      } catch (e) {
        // Fail silently — update check should never break the app.
      }
    }

    checkForUpdate();

    return () => {
      removeListener?.();
    };
  }, []);
}
