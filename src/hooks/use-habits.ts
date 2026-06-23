/**
 * Backwards-compatibility shim.
 * All habit state and actions now live in HabitsContext.
 * Prefer importing directly from '@/contexts/HabitsContext' in new code.
 */
export { useHabitsStore as useHabits, isDoneToday } from '@/contexts/HabitsContext';
export { computeStreak, toDateKey } from '@/lib/habits/streak';
