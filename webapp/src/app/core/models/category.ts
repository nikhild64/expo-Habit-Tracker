import type { HabitCategory } from './habit';

/**
 * Display metadata for each habit category — Ionicons name, hex accent, label.
 * Ported byte-identical from src/lib/ui/colors.ts CATEGORY_META.
 */
export const CATEGORY_META: Record<HabitCategory, { icon: string; color: string; label: string }> = {
  Health:        { icon: 'heart-outline',  color: '#EF4444', label: 'Health' },
  Learning:      { icon: 'book-outline',   color: '#8B5CF6', label: 'Learning' },
  Productivity:  { icon: 'flash-outline',  color: '#F97316', label: 'Productivity' },
  Mindfulness:   { icon: 'leaf-outline',   color: '#16A34A', label: 'Mindfulness' },
  Finance:       { icon: 'cash-outline',   color: '#CA8A04', label: 'Finance' },
  Relationships: { icon: 'people-outline', color: '#EC4899', label: 'Relationships' },
  Other:         { icon: 'apps-outline',   color: '#6B7280', label: 'Other' },
};

/** Background colors for habit icon badges (src/lib/ui/colors.ts HABIT_COLORS). */
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

/** Ionicons names used in the habit icon picker (src/lib/ui/colors.ts HABIT_ICONS). */
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
