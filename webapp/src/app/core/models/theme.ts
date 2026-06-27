/**
 * Theme + accent types — port of the type half of src/lib/ui/theme.ts.
 * (Color values live in tokens.scss; this file only types the runtime axis.)
 */

export type ThemeMode = 'dark' | 'light';

export type AccentId =
  | 'orange'
  | 'indigo'
  | 'emerald'
  | 'rose'
  | 'slate'
  | 'violet'
  | 'teal'
  | 'amber';

export type AccentPreset = {
  id: AccentId;
  label: string;
  /** Hex tint used by JS at runtime (e.g. confetti palette, ProgressRing). */
  tint: string;
  tintDark: string;
  streak: string;
  /** Whether this preset is free (unlocked by default) or shop-only. */
  free: boolean;
};

/** Single source of truth — must match :root[data-accent="…"] blocks in tokens.scss. */
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'orange',  label: 'Sunset',  tint: '#FF8B1F', tintDark: '#D96F0E', streak: '#FB923C', free: true  },
  { id: 'indigo',  label: 'Indigo',  tint: '#6366F1', tintDark: '#4F46E5', streak: '#818CF8', free: true  },
  { id: 'emerald', label: 'Emerald', tint: '#10B981', tintDark: '#059669', streak: '#34D399', free: true  },
  { id: 'rose',    label: 'Rose',    tint: '#F43F5E', tintDark: '#E11D48', streak: '#FB7185', free: false },
  { id: 'slate',   label: 'Slate',   tint: '#64748B', tintDark: '#475569', streak: '#94A3B8', free: false },
  { id: 'violet',  label: 'Violet',  tint: '#8B5CF6', tintDark: '#7C3AED', streak: '#A78BFA', free: false },
  { id: 'teal',    label: 'Teal',    tint: '#14B8A6', tintDark: '#0D9488', streak: '#2DD4BF', free: false },
  { id: 'amber',   label: 'Amber',   tint: '#F59E0B', tintDark: '#D97706', streak: '#FBBF24', free: false },
];

export function getAccentPreset(id: AccentId | string | null | undefined): AccentPreset {
  return ACCENT_PRESETS.find(a => a.id === id) ?? ACCENT_PRESETS[0];
}

/** Brand orange (default accent). */
export const BRAND = '#FF8B1F';
