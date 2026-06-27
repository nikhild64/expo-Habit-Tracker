/**
 * Port of src/lib/routines/types.ts.
 */
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
  /** IDs returned by the legacy scheduler — preserved for cross-platform import. */
  notificationIds: string[];
  streak: number;
  bestStreak: number;
  /** YYYY-MM-DD dates when ALL habits in the routine were completed */
  completions: string[];
  createdAt: string;
};
