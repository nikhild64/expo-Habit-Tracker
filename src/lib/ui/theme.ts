export type Colors = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceHover: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  tint: string;
  tintLight: string;
  tintDark: string;
  done: string;
  doneLight: string;
  streak: string;
  streakLight: string;
  danger: string;
  dangerLight: string;
  tabBar: string;
  tabBorder: string;
};

/** Brand orange (default accent) */
export const BRAND = '#FF8B1F';

// ── Accent presets ───────────────────────────────────────────────────────────

export type AccentId = 'orange' | 'indigo' | 'emerald' | 'rose' | 'slate' | 'violet' | 'teal' | 'amber';

export type AccentPreset = {
  id: AccentId;
  label: string;
  tint: string;
  tintDark: string;
  streak: string;
  /** Whether this preset is free (unlocked by default) or shop-only. */
  free: boolean;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'orange',  label: 'Sunset',    tint: '#FF8B1F', tintDark: '#D96F0E', streak: '#FB923C', free: true  },
  { id: 'indigo',  label: 'Indigo',    tint: '#6366F1', tintDark: '#4F46E5', streak: '#818CF8', free: true  },
  { id: 'emerald', label: 'Emerald',   tint: '#10B981', tintDark: '#059669', streak: '#34D399', free: true  },
  { id: 'rose',    label: 'Rose',      tint: '#F43F5E', tintDark: '#E11D48', streak: '#FB7185', free: false },
  { id: 'slate',   label: 'Slate',     tint: '#64748B', tintDark: '#475569', streak: '#94A3B8', free: false },
  { id: 'violet',  label: 'Violet',    tint: '#8B5CF6', tintDark: '#7C3AED', streak: '#A78BFA', free: false },
  { id: 'teal',    label: 'Teal',      tint: '#14B8A6', tintDark: '#0D9488', streak: '#2DD4BF', free: false },
  { id: 'amber',   label: 'Amber',     tint: '#F59E0B', tintDark: '#D97706', streak: '#FBBF24', free: false },
];

export function getAccentPreset(id: AccentId | string | null | undefined): AccentPreset {
  return ACCENT_PRESETS.find(a => a.id === id) ?? ACCENT_PRESETS[0];
}

// ── Base palettes ────────────────────────────────────────────────────────────

const baseDark: Omit<Colors, 'tint' | 'tintLight' | 'tintDark' | 'streak' | 'streakLight'> = {
  bg: '#0F0F14',
  surface: '#1B1B23',
  surfaceAlt: '#24242E',
  surfaceHover: '#2E2E3C',

  text: '#F4F4FE',
  textSecondary: '#B4B4CC',
  textMuted: '#8080A4',

  border: '#38384E',
  borderStrong: '#4C4C66',

  done: '#34D399',
  doneLight: '#34D39922',
  danger: '#F87171',
  dangerLight: '#F8717122',

  tabBar: '#161620',
  tabBorder: '#38384E',
};

const baseLight: Omit<Colors, 'tint' | 'tintLight' | 'tintDark' | 'streak' | 'streakLight'> = {
  bg: '#FEFBF5',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF4E6',
  surfaceHover: '#FFEAD0',

  text: '#1C1912',
  textSecondary: '#5C5345',
  // Darkened from #9C8E7C to pass WCAG 3:1 against surfaceAlt + surfaceHover.
  // See scripts/contrast-audit.js — previous value failed at 2.94 / 2.73.
  textMuted: '#8B7E6E',

  border: '#EAE0D0',
  borderStrong: '#D4C8B4',

  done: '#16A34A',
  doneLight: '#F0FDF4',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',

  tabBar: '#FEFBF5',
  tabBorder: '#EAE0D0',
};

/**
 * Builds a full color palette for a given mode and accent.
 *
 * The base palette stays constant; only the accent-derived tokens
 * (tint, tintLight, tintDark, streak, streakLight) change with the picker.
 */
export function buildColors(mode: 'dark' | 'light', accentId: AccentId | string | null | undefined): Colors {
  const accent = getAccentPreset(accentId);
  const base = mode === 'dark' ? baseDark : baseLight;
  return {
    ...base,
    tint: accent.tint,
    tintLight: mode === 'dark' ? accent.tint + '28' : accent.tint + '14',
    tintDark: accent.tintDark,
    streak: accent.streak,
    streakLight: mode === 'dark' ? accent.streak + '22' : accent.streak + '18',
  };
}

/** Legacy exports — kept for any callers that still reference the static palettes. */
export const dark: Colors = buildColors('dark', 'orange');
export const light: Colors = buildColors('light', 'orange');
