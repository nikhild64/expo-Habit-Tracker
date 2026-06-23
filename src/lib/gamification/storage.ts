import AsyncStorage from '@react-native-async-storage/async-storage';

import { buildDefaultAchievements } from './rules';
import type { UserProfile } from './types';

const PROFILE_KEY = '@profile_v1';

function makeDefault(): UserProfile {
  const now = new Date().toISOString();
  return {
    xp:               0,
    totalCompletions: 0,
    achievements:     buildDefaultAchievements(),
    createdAt:        now,
    lastUpdated:      now,
  };
}

export async function loadProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return makeDefault();

    const saved = JSON.parse(raw) as Partial<UserProfile>;
    const def   = makeDefault();

    // Merge so any newly-added achievement definitions are included
    return {
      ...def,
      ...saved,
      achievements: def.achievements.map(defAch => {
        const existing = (saved.achievements ?? []).find(a => a.id === defAch.id);
        return existing ?? defAch;
      }),
    };
  } catch {
    return makeDefault();
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
