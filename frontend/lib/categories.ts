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
    calendarBorder: "#7c3aed",
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
    calendarBorder: "#059669",
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
    calendarBorder: "#d97706",
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
    calendarBorder: "#e11d48",
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
    calendarBorder: "#0284c7",
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
    calendarBorder: "#475569",
  },
};

/** Default color for events without a category. */
const DEFAULT_CATEGORY: CategoryConfig = {
  key: "",
  label: "Uncategorized",
  emoji: "📅",
  bg: "bg-indigo-100 dark:bg-indigo-900/30",
  text: "text-indigo-700 dark:text-indigo-300",
  border: "border-indigo-200 dark:border-indigo-800",
  dot: "bg-indigo-500",
  calendarBg: "#6366f1",
  calendarBorder: "#4f46e5",
};

export const CATEGORY_OPTIONS = Object.values(CATEGORIES);

export function getCategoryConfig(category?: string | null): CategoryConfig {
  if (!category) return DEFAULT_CATEGORY;
  return CATEGORIES[category] ?? DEFAULT_CATEGORY;
}
