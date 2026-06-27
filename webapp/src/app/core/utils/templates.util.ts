/**
 * Habit templates — port of src/lib/habits/templates.ts (verbatim).
 */
import type { Frequency, HabitCategory } from '../models/habit';

export type HabitTemplate = {
  id: string;
  name: string;
  icon: string;
  color: string;
  frequency: Frequency;
  category: HabitCategory;
  description: string;
  bundle: string;
};

export type TemplateBundle = {
  id: string;
  label: string;
  icon: string;
  color: string;
  description: string;
};

export const TEMPLATE_BUNDLES: TemplateBundle[] = [
  {
    id: 'morning',
    label: 'Morning Routine',
    icon: 'sunny-outline',
    color: '#F59E0B',
    description: 'Start your day with intention',
  },
  {
    id: 'fitness',
    label: 'Fitness',
    icon: 'barbell-outline',
    color: '#EF4444',
    description: 'Build strength and stay active',
  },
  {
    id: 'learning',
    label: 'Learning',
    icon: 'book-outline',
    color: '#6366F1',
    description: 'Grow your knowledge every day',
  },
  {
    id: 'mindfulness',
    label: 'Mindfulness',
    icon: 'leaf-outline',
    color: '#10B981',
    description: 'Centre yourself and reduce stress',
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: 'cash-outline',
    color: '#16A34A',
    description: 'Take control of your money',
  },
  {
    id: 'productivity',
    label: 'Productivity',
    icon: 'rocket-outline',
    color: '#2563EB',
    description: 'Work smarter and get things done',
  },
];

export const HABIT_TEMPLATES: HabitTemplate[] = [
  // Morning Routine
  { id: 'drink-water',          name: 'Drink Water',          icon: 'water-outline',         color: '#3B82F6', frequency: { kind: 'daily', hour: 7,  minute: 0  }, category: 'Health',       description: 'Hydrate first thing in the morning',                bundle: 'morning' },
  { id: 'morning-meditation',   name: 'Morning Meditation',   icon: 'flower-outline',        color: '#8B5CF6', frequency: { kind: 'daily', hour: 7,  minute: 30 }, category: 'Mindfulness',  description: '10 minutes of stillness before the day begins',     bundle: 'morning' },
  { id: 'journal',              name: 'Morning Journal',      icon: 'journal-outline',       color: '#EC4899', frequency: { kind: 'daily', hour: 8,  minute: 0  }, category: 'Mindfulness',  description: 'Write down your thoughts and intentions',           bundle: 'morning' },
  { id: 'cold-shower',          name: 'Cold Shower',          icon: 'rainy-outline',         color: '#06B6D4', frequency: { kind: 'daily', hour: 6,  minute: 30 }, category: 'Health',       description: 'Boost energy and resilience',                       bundle: 'morning' },

  // Fitness
  { id: 'workout',              name: 'Workout',              icon: 'barbell-outline',       color: '#EF4444', frequency: { kind: 'daily', hour: 7,  minute: 0  }, category: 'Health',       description: '30+ minutes of focused exercise',                   bundle: 'fitness' },
  { id: 'evening-walk',         name: 'Evening Walk',         icon: 'walk-outline',          color: '#10B981', frequency: { kind: 'daily', hour: 18, minute: 0  }, category: 'Health',       description: 'Unwind with a 20-minute walk',                      bundle: 'fitness' },
  { id: 'stretching',           name: 'Stretching',           icon: 'body-outline',          color: '#F59E0B', frequency: { kind: 'daily', hour: 7,  minute: 30 }, category: 'Health',       description: '10 minutes of mobility and flexibility',            bundle: 'fitness' },
  { id: 'yoga',                 name: 'Yoga',                 icon: 'fitness-outline',       color: '#A855F7', frequency: { kind: 'daily', hour: 6,  minute: 0  }, category: 'Health',       description: 'Connect body and mind through movement',            bundle: 'fitness' },

  // Learning
  { id: 'read-20min',           name: 'Read 20 Minutes',      icon: 'book-outline',          color: '#6366F1', frequency: { kind: 'daily', hour: 21, minute: 0  }, category: 'Learning',     description: 'One book a month, one chapter at a time',           bundle: 'learning' },
  { id: 'learn-language',       name: 'Language Practice',    icon: 'language-outline',      color: '#F59E0B', frequency: { kind: 'daily', hour: 19, minute: 0  }, category: 'Learning',     description: '15 minutes with Duolingo or flashcards',            bundle: 'learning' },
  { id: 'study-skill',          name: 'Study / Practice Skill', icon: 'school-outline',      color: '#8B5CF6', frequency: { kind: 'daily', hour: 18, minute: 0  }, category: 'Learning',     description: 'Deep practice on your chosen subject',              bundle: 'learning' },
  { id: 'write-500-words',      name: 'Write 500 Words',      icon: 'create-outline',        color: '#EC4899', frequency: { kind: 'daily', hour: 20, minute: 0  }, category: 'Learning',     description: 'Build the writing habit one page at a time',        bundle: 'learning' },

  // Mindfulness
  { id: 'gratitude',            name: 'Gratitude List',       icon: 'heart-outline',         color: '#EC4899', frequency: { kind: 'daily', hour: 21, minute: 0  }, category: 'Mindfulness',  description: 'Write 3 things you are grateful for',               bundle: 'mindfulness' },
  { id: 'no-social-media',      name: 'No Social Media',      icon: 'phone-portrait-outline',color: '#64748B', frequency: { kind: 'daily', hour: 8,  minute: 0  }, category: 'Mindfulness',  description: 'Start the day without doomscrolling',               bundle: 'mindfulness' },
  { id: 'nature-walk',          name: 'Walk in Nature',       icon: 'leaf-outline',          color: '#10B981', frequency: { kind: 'daily', hour: 17, minute: 0  }, category: 'Mindfulness',  description: '10 minutes outdoors, phone in pocket',              bundle: 'mindfulness' },

  // Finance
  { id: 'track-expenses',       name: 'Track Expenses',       icon: 'cash-outline',          color: '#16A34A', frequency: { kind: 'daily', hour: 21, minute: 0  }, category: 'Finance',      description: 'Log every purchase before bed',                      bundle: 'finance' },
  { id: 'no-impulse-buy',       name: 'No Impulse Buy',       icon: 'cart-outline',          color: '#EF4444', frequency: { kind: 'daily', hour: 8,  minute: 0  }, category: 'Finance',      description: 'Wait 24 hours before non-essential purchases',       bundle: 'finance' },

  // Productivity
  { id: 'review-priorities',    name: 'Review Priorities',    icon: 'checkmark-done-outline',color: '#2563EB', frequency: { kind: 'daily', hour: 8,  minute: 0  }, category: 'Productivity', description: 'Identify your 3 most important tasks',               bundle: 'productivity' },
  { id: 'no-work-after-7',      name: 'Unplug After 7 PM',    icon: 'moon-outline',          color: '#475569', frequency: { kind: 'daily', hour: 19, minute: 0  }, category: 'Productivity', description: 'Protect your evenings for rest and recovery',        bundle: 'productivity' },
];

/** Returns all templates belonging to a given bundle id. */
export function getTemplatesByBundle(bundleId: string): HabitTemplate[] {
  return HABIT_TEMPLATES.filter(t => t.bundle === bundleId);
}
