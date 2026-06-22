export const C = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F5',
  surfaceHover: '#F0F0F2',

  text: '#18181B',
  textSecondary: '#52525B',
  textMuted: '#A1A1AA',

  border: '#E4E4E7',
  borderStrong: '#D4D4D8',

  tint: '#2563EB',
  tintLight: '#EFF6FF',
  tintDark: '#1D4ED8',

  done: '#16A34A',
  doneLight: '#F0FDF4',

  streak: '#EA580C',
  streakLight: '#FFF7ED',

  danger: '#DC2626',
  dangerLight: '#FEF2F2',

  tabBar: '#FFFFFF',
  tabBorder: '#E4E4E7',
} as const;

/** Background colors for habit icon badges */
export const HABIT_COLORS = [
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#F97316',
  '#CA8A04',
  '#16A34A',
  '#0891B2',
] as const;

/** Ionicons names used in the habit icon picker */
export const HABIT_ICONS = [
  'water-outline',
  'book-outline',
  'barbell-outline',
  'code-outline',
  'moon-outline',
  'leaf-outline',
  'walk-outline',
  'musical-notes-outline',
  'heart-outline',
  'flame-outline',
  'bicycle-outline',
  'nutrition-outline',
  'brush-outline',
  'cafe-outline',
  'bed-outline',
  'headset-outline',
] as const;

export type HabitColor = (typeof HABIT_COLORS)[number];
export type HabitIconName = (typeof HABIT_ICONS)[number];
