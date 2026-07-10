export type CategoryConfig = {
  key: string;
  label: string;
  emoji: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
  calendarBg: string;
  calendarBorder: string;
};

export const CATEGORIES: Record<string, CategoryConfig> = {
  meeting: {
    key: "meeting",
    label: "Meeting",
    emoji: "👥",
    bg: "bg-violet-100 dark:bg-violet-900/30",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200 dark:border-violet-800",
    dot: "bg-violet-500",
    calendarBg: "#8b5cf6",
    calendarBorder: "#5b21b6",
  },
  personal: {
    key: "personal",
    label: "Personal",
    emoji: "🏠",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
    calendarBg: "#10b981",
    calendarBorder: "#047857",
  },
  focus: {
    key: "focus",
    label: "Focus Work",
    emoji: "🎯",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
    calendarBg: "#f59e0b",
    calendarBorder: "#b45309",
  },
  health: {
    key: "health",
    label: "Health",
    emoji: "💪",
    bg: "bg-rose-100 dark:bg-rose-900/30",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800",
    dot: "bg-rose-500",
    calendarBg: "#f43f5e",
    calendarBorder: "#be123c",
  },
  social: {
    key: "social",
    label: "Social",
    emoji: "🎉",
    bg: "bg-sky-100 dark:bg-sky-900/30",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-200 dark:border-sky-800",
    dot: "bg-sky-500",
    calendarBg: "#0ea5e9",
    calendarBorder: "#0369a1",
  },
  other: {
    key: "other",
    label: "Other",
    emoji: "📌",
    bg: "bg-slate-100 dark:bg-slate-800/50",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
    calendarBg: "#64748b",
    calendarBorder: "#334155",
  },
};

/** Default color for events without a category. */
const DEFAULT_CATEGORY: CategoryConfig = {
  key: "",
  label: "Uncategorized",
  emoji: "📅",
  bg: "bg-slate-100 dark:bg-slate-800/50",
  text: "text-slate-600 dark:text-slate-400",
  border: "border-slate-200 dark:border-slate-700",
  dot: "bg-slate-400",
  calendarBg: "#94a3b8",
  calendarBorder: "#64748b",
};

export const CATEGORY_OPTIONS = Object.values(CATEGORIES);

export function getCategoryConfig(category?: string | null): CategoryConfig {
  if (!category) return DEFAULT_CATEGORY;
  return CATEGORIES[category] ?? DEFAULT_CATEGORY;
}

/**
 * Keyword-based rules for auto-categorizing events by title.
 * Each entry maps a category key to an array of lowercase keywords/phrases.
 */
const AUTO_CATEGORY_RULES: Array<{ key: string; keywords: string[] }> = [
  { key: "meeting", keywords: ["meeting", "sync", "standup", "stand-up", "1-on-1", "1:1", "call", "interview", "review", "retro", "retrospective", "check-in", "check in", "huddle"] },
  { key: "focus", keywords: ["focus", "deep work", "focus block", "heads down", "coding", "writing", "research", "study", "belajar"] },
  { key: "personal", keywords: ["personal", "errand", "appointment", "dentist", "doctor", "haircut", "belanja", "pribadi"] },
  { key: "health", keywords: ["gym", "workout", "exercise", "run", "yoga", "meditation", "walk", "olahraga", "lari", "health"] },
  { key: "social", keywords: ["lunch", "dinner", "coffee", "happy hour", "party", "hangout", "date", "makan", "social", "catch up", "catchup"] },
];

/**
 * Infer a category from an event title using keyword matching.
 * Returns the category key if a match is found, or `null` if no match.
 */
export function inferCategoryFromTitle(title: string): string | null {
  if (!title) return null;
  const lower = title.trim().toLowerCase();
  for (const rule of AUTO_CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        return rule.key;
      }
    }
  }
  return null;
}
