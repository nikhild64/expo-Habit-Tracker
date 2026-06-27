/**
 * Port of src/lib/habits/quiet-hours.ts (type half only — pure helpers live in
 * core/utils/quiet-hours.util.ts).
 */
export type QuietHours = {
  enabled: boolean;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

export const DEFAULT_QUIET_HOURS: QuietHours = {
  enabled: false,
  startHour: 22,
  startMinute: 0,
  endHour: 7,
  endMinute: 0,
};
