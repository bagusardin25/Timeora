"use client";

import type { LucideProps } from "lucide-react";
import {
  Users,
  Home,
  Target,
  Dumbbell,
  PartyPopper,
  Pin,
  Calendar,
} from "lucide-react";

/**
 * Maps category keys to Lucide icon components for a polished,
 * consistent look across the calendar UI.
 */
const CATEGORY_ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  meeting: Users,
  personal: Home,
  focus: Target,
  health: Dumbbell,
  social: PartyPopper,
  other: Pin,
};

const DEFAULT_ICON = Calendar;

interface CategoryIconProps extends LucideProps {
  /** The category key (e.g. "meeting", "focus"). Falls back to a calendar icon. */
  categoryKey?: string | null;
}

/**
 * Renders the appropriate Lucide icon for a given category key.
 * Use this instead of emoji strings for a cleaner, more professional UI.
 */
export function CategoryIcon({ categoryKey, ...props }: CategoryIconProps) {
  const Icon = (categoryKey && CATEGORY_ICON_MAP[categoryKey]) || DEFAULT_ICON;
  return <Icon {...props} />;
}
