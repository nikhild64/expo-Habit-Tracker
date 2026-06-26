import AsyncStorage from '@react-native-async-storage/async-storage';

/** 1 = terrible, 5 = excellent. */
export type MoodScore = 1 | 2 | 3 | 4 | 5;

export type MoodEntry = {
  /** YYYY-MM-DD */
  date: string;
  /** Optional morning mood (5-point) */
  morningMood?: MoodScore;
  /** Optional morning energy (5-point) */
  morningEnergy?: MoodScore;
  /** Optional evening mood */
  eveningMood?: MoodScore;
  /** Optional evening energy */
  eveningEnergy?: MoodScore;
  /** Single free-form day reflection. */
  reflection?: string;
};

const MOOD_KEY = '@mood_v1';

export async function loadMoodEntries(): Promise<Record<string, MoodEntry>> {
  try {
    const raw = await AsyncStorage.getItem(MOOD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

export async function saveMoodEntries(entries: Record<string, MoodEntry>): Promise<void> {
  await AsyncStorage.setItem(MOOD_KEY, JSON.stringify(entries));
}

export const MOOD_EMOJI: Record<MoodScore, string> = {
  1: '😞',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😄',
};

export const MOOD_LABEL: Record<MoodScore, string> = {
  1: 'Rough',
  2: 'Meh',
  3: 'OK',
  4: 'Good',
  5: 'Great',
};

export const ENERGY_LABEL: Record<MoodScore, string> = {
  1: 'Drained',
  2: 'Low',
  3: 'Steady',
  4: 'Strong',
  5: 'Buzzing',
};
