type AuthTokens = {
  access_token?: string;
  refresh_token?: string | null;
};

type PersistAuthTokensOptions = {
  preserveRefreshToken?: boolean;
};

type JwtIdentityPayload = {
  email?: unknown;
  name?: unknown;
  full_name?: unknown;
  user_metadata?: {
    email?: unknown;
    name?: unknown;
    full_name?: unknown;
  };
};

export function persistAuthTokens(
  tokens: AuthTokens,
  options: PersistAuthTokensOptions = {},
): void {
  if (tokens.access_token) {
    localStorage.setItem("token", tokens.access_token);
  }

  if (tokens.refresh_token) {
    localStorage.setItem("refresh_token", tokens.refresh_token);
    return;
  }

  // Keep existing refresh token across access-only refreshes when requested.
  if (!options.preserveRefreshToken) {
    localStorage.removeItem("refresh_token");
  }
}

/** True when both access + refresh tokens are present (required for silent renew). */
export function hasAuthSession(): boolean {
  return Boolean(localStorage.getItem("token") && localStorage.getItem("refresh_token"));
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readJwtPayload(): JwtIdentityPayload | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const token = localStorage.getItem("token");
    if (!token) return null;
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;
    return JSON.parse(decodeBase64Url(payloadSegment)) as JwtIdentityPayload;
  } catch {
    return null;
  }
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Email from the access JWT (Supabase-style claims supported). */
export function getTokenEmail(): string | null {
  const payload = readJwtPayload();
  if (!payload) return null;
  return (
    asNonEmptyString(payload.email) ??
    asNonEmptyString(payload.user_metadata?.email) ??
    null
  );
}

/** Display name from JWT when present; otherwise null. */
export function getTokenDisplayName(): string | null {
  const payload = readJwtPayload();
  if (!payload) return null;
  return (
    asNonEmptyString(payload.name) ??
    asNonEmptyString(payload.full_name) ??
    asNonEmptyString(payload.user_metadata?.name) ??
    asNonEmptyString(payload.user_metadata?.full_name) ??
    null
  );
}

/**
 * Two-letter avatar initials from account name or email.
 * - "Ellisa Foo" → EF
 * - "ellisa@example.com" → EL
 * - "john.doe@example.com" → JD
 */
export function getAccountInitials(
  nameOrEmail?: string | null,
  fallback = "?",
): string {
  const source = (nameOrEmail ?? getTokenDisplayName() ?? getTokenEmail() ?? "").trim();
  if (!source) return fallback;

  // Prefer human name when it has spaces
  if (!source.includes("@") && /\s/.test(source)) {
    const parts = source.split(/\s+/).filter(Boolean);
    const letters = parts.slice(0, 2).map((part) => part[0] ?? "").join("");
    return (letters || fallback).toUpperCase();
  }

  const local = source.includes("@") ? source.split("@")[0] ?? source : source;
  const cleaned = local.replace(/[^a-zA-Z0-9._-]/g, "");
  const segments = cleaned.split(/[._-]+/).filter(Boolean);

  if (segments.length >= 2) {
    const a = segments[0][0] ?? "";
    const b = segments[1][0] ?? "";
    return `${a}${b}`.toUpperCase() || fallback;
  }

  const single = segments[0] ?? cleaned;
  if (single.length >= 2) return single.slice(0, 2).toUpperCase();
  if (single.length === 1) return `${single}${single}`.toUpperCase();
  return fallback;
}
