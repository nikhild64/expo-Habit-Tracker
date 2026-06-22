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

/** Brand orange */
export const BRAND = '#FF8B1F';

export const dark: Colors = {
  // Backgrounds — neutral dark (keeps habit colors vibrant)
  bg: '#0F0F14',
  surface: '#1B1B23',
  surfaceAlt: '#24242E',
  surfaceHover: '#2E2E3C',

  // Text — lifted for accessibility (WCAG AA on #0F0F14 bg)
  text: '#F4F4FE',           // contrast ~18:1 ✓
  textSecondary: '#B4B4CC',  // contrast ~7:1 ✓
  textMuted: '#8080A4',      // contrast ~4:1 ✓ (decorative)

  // Borders — more visible than before
  border: '#38384E',
  borderStrong: '#4C4C66',

  // Brand — warm orange on dark feels premium
  tint: BRAND,
  tintLight: '#FF8B1F28',
  tintDark: '#D96F0E',

  // Semantic
  done: '#34D399',           // emerald-400 — better on dark than green-500
  doneLight: '#34D39922',
  streak: '#FB923C',         // orange-400 — distinct from tint
  streakLight: '#FB923C22',
  danger: '#F87171',         // red-400 — visible on dark
  dangerLight: '#F8717122',

  tabBar: '#161620',
  tabBorder: '#38384E',
};

/** Warm cream / amber-tinted light theme */
export const light: Colors = {
  // Backgrounds — subtle amber warmth
  bg: '#FEFBF5',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF4E6',
  surfaceHover: '#FFEAD0',

  // Text
  text: '#1C1912',
  textSecondary: '#5C5345',
  textMuted: '#9C8E7C',

  // Borders — warm
  border: '#EAE0D0',
  borderStrong: '#D4C8B4',

  // Brand
  tint: BRAND,
  tintLight: '#FFF4E6',
  tintDark: '#D96F0E',

  // Semantic
  done: '#16A34A',
  doneLight: '#F0FDF4',
  streak: '#EA580C',
  streakLight: '#FFF7ED',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',

  tabBar: '#FEFBF5',
  tabBorder: '#EAE0D0',
};
