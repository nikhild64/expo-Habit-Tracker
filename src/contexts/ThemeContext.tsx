import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { dark, light } from '@/lib/ui/theme';
import type { Colors } from '@/lib/ui/theme';

type ThemeType = 'dark' | 'light';
const THEME_KEY = '@theme_v1';

type ThemeContextValue = {
  theme: ThemeType;
  isDark: boolean;
  C: Colors;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  isDark: true,
  C: dark,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeType>('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark') setTheme(saved);
    });
  }, []);

  function toggleTheme() {
    const next: ThemeType = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    AsyncStorage.setItem(THEME_KEY, next).catch(console.error);
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', C: theme === 'dark' ? dark : light, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Returns the current theme's color palette. */
export function useColors(): Colors {
  return useContext(ThemeContext).C;
}

/** Returns the full theme context (theme name, isDark, colors, toggle). */
export function useTheme() {
  return useContext(ThemeContext);
}
