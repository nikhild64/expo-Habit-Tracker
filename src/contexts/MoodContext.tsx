import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { loadMoodEntries, saveMoodEntries } from '@/lib/mood/storage';
import type { MoodEntry } from '@/lib/mood/storage';
import { toDateKey } from '@/lib/habits/streak';

type MoodContextValue = {
  entries: Record<string, MoodEntry>;
  loading: boolean;
  /** Get today's entry (or undefined). */
  today: MoodEntry | undefined;
  /** Upsert one or more fields onto a date's entry. */
  upsertEntry: (date: string, patch: Partial<MoodEntry>) => Promise<void>;
  /** Save a reflection (creates or updates entry). */
  setReflection: (date: string, text: string) => Promise<void>;
};

const MoodContext = createContext<MoodContextValue>({
  entries: {},
  loading: true,
  today: undefined,
  upsertEntry: async () => {},
  setReflection: async () => {},
});

export function MoodProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, MoodEntry>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMoodEntries().then(data => {
      setEntries(data);
      setLoading(false);
    });
  }, []);

  const upsertEntry = useCallback(async (date: string, patch: Partial<MoodEntry>) => {
    setEntries(prev => {
      const existing = prev[date] ?? { date };
      const merged: MoodEntry = { ...existing, ...patch, date };
      const next = { ...prev, [date]: merged };
      saveMoodEntries(next).catch(console.error);
      return next;
    });
  }, []);

  const setReflection = useCallback(async (date: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setEntries(prev => {
        const existing = prev[date];
        if (!existing) return prev;
        const { reflection: _, ...rest } = existing;
        void _;
        if (Object.keys(rest).length === 1) {
          // only `date` left — drop the entry entirely
          const next = { ...prev };
          delete next[date];
          saveMoodEntries(next).catch(console.error);
          return next;
        }
        const next = { ...prev, [date]: rest as MoodEntry };
        saveMoodEntries(next).catch(console.error);
        return next;
      });
      return;
    }
    setEntries(prev => {
      const existing = prev[date] ?? { date };
      const next = { ...prev, [date]: { ...existing, reflection: trimmed, date } };
      saveMoodEntries(next).catch(console.error);
      return next;
    });
  }, []);

  const today = entries[toDateKey(new Date())];

  return (
    <MoodContext.Provider value={{ entries, loading, today, upsertEntry, setReflection }}>
      {children}
    </MoodContext.Provider>
  );
}

export function useMood() {
  return useContext(MoodContext);
}
