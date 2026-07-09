import type { Locale } from "../types";
import { en, type Dictionary } from "./en";
import { id } from "./id";

export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { en, id };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}

/** Dot-path lookup, e.g. "assistant.title" */
export type MessageKey = string;

export function translate(
  dictionary: Dictionary,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const parts = key.split(".");
  let node: unknown = dictionary;
  for (const part of parts) {
    if (!node || typeof node !== "object") return key;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") return key;
  if (!vars) return node;
  return node.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}
