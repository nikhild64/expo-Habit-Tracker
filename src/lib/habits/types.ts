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

/**
 * Time of day a habit belongs to. Drives section grouping on the Today tab
 * (Habitify-style). 'anytime' is the default and shows in every section.
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'anytime';

/**
 * Habit type drives the completion model:
 *  - binary: tap to mark done (the original model)
 *  - quantitative: accumulate a numeric value toward a target (e.g. 8 glasses)
 *  - timed: accumulate seconds via a built-in timer toward a duration target
 *  - negative: a quit/bad-habit tracker; "done" means "did NOT slip today"
 */
export type HabitType = 'binary' | 'quantitative' | 'timed' | 'negative';

export type HabitTarget = {
  /** Numeric target — 8 for "8 glasses", 30 for "30 pages", 1800 for "30 min" */
  value: number;
  /** Display unit — 'glasses', 'pages', 'km', 'min', etc. */
  unit: string;
  /** For 'timed' habits: target duration in seconds. */
  timerSeconds?: number;
};

export type Subtask = {
  id: string;
  label: string;
};

export type Reminder = {
  id: string;
  hour: number;
  minute: number;
  /** Optional weekday filter (1=Sun..7=Sat, Expo convention). Empty = every day. */
  weekdays?: number[];
  label?: string;
};

export type Habit = {
  id: string;
  name: string;
  /** Ionicons icon name OR a single emoji character. */
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

  // ── v7 additions (all optional with sensible defaults for migration) ──────

  /** Habit type — defaults to 'binary' for existing habits. */
  habitType?: HabitType;
  /** Target value + unit (for 'quantitative' and 'timed'). */
  target?: HabitTarget;
  /** Sub-tasks/checklist within this habit (e.g. morning routine items). */
  subtasks?: Subtask[];
  /** Time-of-day section assignment for Today grouping. Defaults to 'anytime'. */
  timeOfDay?: TimeOfDay;
  /**
   * Multiple reminders. When set, replaces the single time from frequency.hour/minute.
   * If absent, scheduling falls back to a single reminder from frequency.
   */
  reminders?: Reminder[];
  /** Planned days off — counted as neutral (no streak break, no completion). */
  skipDays?: string[];
  /** Quantitative habit progress per day: YYYY-MM-DD → numeric value accumulated. */
  progress?: Record<string, number>;
  /** Timed habit sessions per day: YYYY-MM-DD → total seconds accumulated today. */
  sessionSeconds?: Record<string, number>;
  /** Sub-task completions per day: YYYY-MM-DD → array of subtask IDs done that day. */
  subtaskCompletions?: Record<string, string[]>;
  /** Negative-habit slip dates (the days the user slipped). */
  slipDates?: string[];
  /** Cached habit strength score (0–100, Loop-style exponential moving average). */
  strengthScore?: number;
};
