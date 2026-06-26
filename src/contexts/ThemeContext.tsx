import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ACCENT_PRESETS, buildColors } from '@/lib/ui/theme';
import type { AccentId, Colors } from '@/lib/ui/theme';

type ThemeType = 'dark' | 'light';
const THEME_KEY  = '@theme_v1';
const ACCENT_KEY = '@accent_v1';
const UNLOCKED_KEY = '@accents_unlocked_v1';

type ThemeContextValue = {
  theme: ThemeType;
  isDark: boolean;
  C: Colors;
  accent: AccentId;
  unlockedAccents: AccentId[];
  toggleTheme: () => void;
  setAccent: (id: AccentId) => void;
  unlockAccent: (id: AccentId) => Promise<void>;
};

const defaultColors = buildColors('dark', 'orange');

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  isDark: true,
  C: defaultColors,
  accent: 'orange',
  unlockedAccents: ACCENT_PRESETS.filter(a => a.free).map(a => a.id),
  toggleTheme: () => {},
  setAccent: () => {},
  unlockAccent: async () => {},
});

const defaultUnlocked: AccentId[] = ACCENT_PRESETS.filter(a => a.free).map(a => a.id);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeType>('dark');
  const [accent, setAccentState] = useState<AccentId>('orange');
  const [unlockedAccents, setUnlockedAccents] = useState<AccentId[]>(defaultUnlocked);

  useEffect(() => {
    AsyncStorage.multiGet([THEME_KEY, ACCENT_KEY, UNLOCKED_KEY]).then(entries => {
      for (const [k, v] of entries) {
        if (k === THEME_KEY && (v === 'light' || v === 'dark')) {
          setTheme(v);
        }
        if (k === ACCENT_KEY && v && ACCENT_PRESETS.some(a => a.id === v)) {
          setAccentState(v as AccentId);
        }
        if (k === UNLOCKED_KEY && v) {
          try {
            const parsed = JSON.parse(v) as AccentId[];
            if (Array.isArray(parsed)) {
              // Always ensure free presets stay unlocked
              const merged = Array.from(new Set([...defaultUnlocked, ...parsed]));
              setUnlockedAccents(merged);
            }
          } catch { /* ignore */ }
        }
      }
    });
  }, []);

  function toggleTheme() {
    const next: ThemeType = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    AsyncStorage.setItem(THEME_KEY, next).catch(console.error);
  }

  const setAccent = useCallback((id: AccentId) => {
    setAccentState(id);
    AsyncStorage.setItem(ACCENT_KEY, id).catch(console.error);
  }, []);

  const unlockAccent = useCallback(async (id: AccentId) => {
    if (unlockedAccents.includes(id)) return;
    const next = [...unlockedAccents, id];
    setUnlockedAccents(next);
    await AsyncStorage.setItem(UNLOCKED_KEY, JSON.stringify(next));
  }, [unlockedAccents]);

  const C = useMemo(() => buildColors(theme, accent), [theme, accent]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        C,
        accent,
        unlockedAccents,
        toggleTheme,
        setAccent,
        unlockAccent,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

/** Returns the current theme's color palette. */
export function useColors(): Colors {
  return useContext(ThemeContext).C;
}

/** Returns the full theme context (theme name, isDark, colors, accent, toggles). */
export function useTheme() {
  return useContext(ThemeContext);
}
