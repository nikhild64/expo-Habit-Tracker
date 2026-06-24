export type Frequency =
  | { kind: 'daily';    hour: number; minute: number }
  | { kind: 'weekly';   weekdays: number[]; hour: number; minute: number }
  | { kind: 'xperweek'; count: number;      hour: number; minute: number }
  | { kind: 'weekdays'; hour: number; minute: number }
  | { kind: 'weekends'; hour: number; minute: number }
  | { kind: 'interval'; days: number;       hour: number; minute: number };

export type HabitCategory =
  | 'Health'
  | 'Learning'
  | 'Productivity'
  | 'Mindfulness'
  | 'Finance'
  | 'Relationships'
  | 'Other';

export type HabitStatus = 'active' | 'paused' | 'archived';

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
  /** Which life area this habit belongs to. */
  category: HabitCategory;
  /** Active = shown & tracked. Paused = hidden, no decay. Archived = hidden, history preserved. */
  status: HabitStatus;
  /** ISO timestamp when the habit was paused, or null. */
  pausedAt: string | null;
  /** How many streak-freeze tokens are available (max 3, earned at every 7-day milestone). */
  freezesAvailable: number;
  /** ISO date strings (YYYY-MM-DD) for days when a freeze was consumed. */
  freezeUsedDates: string[];
  /** Journal notes attached to specific completion dates: YYYY-MM-DD → note text. */
  notes: Record<string, string>;
  /**
   * Full ISO timestamps for each completion: YYYY-MM-DD → ISO string.
   * Used by smart-reminders to find the optimal reminder hour.
   */
  completionTimestamps: Record<string, string>;
};
