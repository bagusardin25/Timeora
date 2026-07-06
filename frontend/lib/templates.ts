import { CATEGORIES } from "@/lib/categories";
import type { EventData } from "@/components/calendar/EventDialog";

export type EventTemplate = {
  id: string;
  name: string;
  title: string;
  duration_minutes: number;
  start_time: string;
  category: string | null;
  participants: string;
};

const STORAGE_KEY = "timeora_templates";
const MIN_TEMPLATE_DURATION = 5;
const MAX_TEMPLATE_DURATION = 480;
const DEFAULT_TEMPLATE_START_TIME = "09:00:00";
const TIME_VALUE_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

const DEFAULT_TEMPLATES: EventTemplate[] = [
  {
    id: "preset-standup",
    name: "Daily Standup",
    title: "Daily Standup",
    duration_minutes: 15,
    start_time: "09:00:00",
    category: "meeting",
    participants: "",
  },
  {
    id: "preset-lunch",
    name: "Lunch Break",
    title: "Lunch Break",
    duration_minutes: 60,
    start_time: "12:00:00",
    category: "personal",
    participants: "",
  },
  {
    id: "preset-focus",
    name: "Focus Time",
    title: "Deep Focus Work",
    duration_minutes: 120,
    start_time: "14:00:00",
    category: "focus",
    participants: "",
  },
  {
    id: "preset-1on1",
    name: "1-on-1 Meeting",
    title: "1-on-1",
    duration_minutes: 30,
    start_time: "10:00:00",
    category: "meeting",
    participants: "",
  },
];

function isEventTemplate(value: unknown): value is EventTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as Partial<EventTemplate>;
  return (
    typeof template.id === "string" &&
    typeof template.name === "string" &&
    typeof template.title === "string" &&
    typeof template.duration_minutes === "number" &&
    Number.isFinite(template.duration_minutes) &&
    template.duration_minutes >= MIN_TEMPLATE_DURATION &&
    template.duration_minutes <= MAX_TEMPLATE_DURATION &&
    typeof template.start_time === "string" &&
    TIME_VALUE_PATTERN.test(template.start_time) &&
    (template.category === null || (
      typeof template.category === "string" &&
      template.category in CATEGORIES
    )) &&
    typeof template.participants === "string"
  );
}

function normalizeDuration(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return Math.min(
    MAX_TEMPLATE_DURATION,
    Math.max(MIN_TEMPLATE_DURATION, Math.round(value)),
  );
}

function normalizeStartTime(value: string): string {
  if (!TIME_VALUE_PATTERN.test(value)) return DEFAULT_TEMPLATE_START_TIME;
  return value.length === 5 ? `${value}:00` : value;
}

function normalizeCategory(value: string | null): string | null {
  if (!value) return null;
  return value in CATEGORIES ? value : null;
}

function normalizeTemplate(template: Omit<EventTemplate, "id">): Omit<EventTemplate, "id"> {
  return {
    ...template,
    duration_minutes: normalizeDuration(template.duration_minutes),
    start_time: normalizeStartTime(template.start_time),
    category: normalizeCategory(template.category),
  };
}

function readCustomTemplates(): EventTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEventTemplate);
  } catch {
    return [];
  }
}

export function getTemplates(): EventTemplate[] {
  if (typeof window === "undefined") return DEFAULT_TEMPLATES;
  return [...DEFAULT_TEMPLATES, ...readCustomTemplates()];
}

export function getCustomTemplates(): EventTemplate[] {
  return readCustomTemplates();
}

export function saveTemplate(template: Omit<EventTemplate, "id">): EventTemplate {
  const custom = getCustomTemplates();
  const newTemplate: EventTemplate = {
    ...normalizeTemplate(template),
    id: `custom-${Date.now()}`,
  };
  custom.push(newTemplate);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  return newTemplate;
}

export function deleteTemplate(id: string): void {
  // Only allow deleting custom templates
  if (id.startsWith("preset-")) return;
  const custom = getCustomTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
}

export function applyTemplate(
  template: EventTemplate,
  date?: string
): Partial<EventData> {
  return {
    title: template.title,
    date: date || new Date().toISOString().slice(0, 10),
    start_time: template.start_time,
    duration_minutes: template.duration_minutes,
    participants: template.participants,
    category: template.category,
  };
}
