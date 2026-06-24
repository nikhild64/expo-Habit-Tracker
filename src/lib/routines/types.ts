export type Routine = {
  id: string;
  name: string;
  /** Ionicons icon name */
  icon: string;
  /** Hex color for the icon badge background */
  color: string;
  /** Ordered list of habit IDs that make up this routine */
  habitIds: string[];
  /** Optional daily reminder time; null means no reminder */
  reminderTime: { hour: number; minute: number } | null;
  /** IDs returned by scheduleNotificationAsync — stored so we can cancel later */
  notificationIds: string[];
  streak: number;
  bestStreak: number;
  /** YYYY-MM-DD dates when ALL habits in the routine were completed */
  completions: string[];
  createdAt: string;
};
