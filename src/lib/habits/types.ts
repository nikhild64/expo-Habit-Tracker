export type Frequency =
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; weekdays: number[]; hour: number; minute: number };

export type Habit = {
  id: string;
  name: string;
  /** Ionicons icon name */
  icon: string;
  /** Hex color for the icon badge background */
  color: string;
  frequency: Frequency;
  /** IDs returned by scheduleNotificationAsync — stored so we can cancel later */
  notificationIds: string[];
  streak: number;
  bestStreak: number;
  /** ISO date strings (YYYY-MM-DD) for every day this habit was completed. */
  completions: string[];
  /**
   * @deprecated Kept only for v1→v2 storage migration and the notification
   * background handler. All new code should use `completions` instead.
   */
  lastCompletedISO: string | null;
  createdAt: string;
  /** Display order in the Today list. Lower = higher. Pinned habits sort before unpinned. */
  sortOrder: number;
  /** Pinned habits always appear at the top of the Today list. */
  pinned: boolean;
};
