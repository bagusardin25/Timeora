import { persistAuthTokens } from './session';

/**
 * Prefer same-origin `/backend-api` (see app/backend-api/[...path]/route.ts).
 * Absolute NEXT_PUBLIC_API_URL is only for production deploys.
 * Never fall back to localhost:8000 — that hangs on many Windows browsers.
 */
function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  if (configured) return configured.replace(/\/+$/, '');
  return '/backend-api';
}

export const API_BASE_URL = resolveApiBaseUrl();
/** Visible in timeout errors / dashboard so we know the browser loaded this bundle. */
export const API_CLIENT_BUILD = 'timeora-api-v6-no-abort';
/**
 * Only apply a client abort for absolute cross-origin APIs.
 * Same-origin `/backend-api` must not be aborted early — Windows + stale
 * localhost:8000 hang was previously reported as a generic 15s timeout.
 */
const DEFAULT_TIMEOUT_MS = API_BASE_URL.startsWith('http') ? 45_000 : 0;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null
    ? value as JsonRecord
    : {};
}

function errorMessage(data: JsonRecord, defaultMessage: string): string {
  const detail = data.detail;
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object' && detail !== null) {
    const message = (detail as JsonRecord).message;
    if (typeof message === 'string') return message;
  }
  return defaultMessage;
}

export class ApiError extends Error {
  public status: number;
  public data: JsonRecord;

  constructor(status: number, data: unknown, defaultMessage: string) {
    const normalizedData = asRecord(data);
    super(errorMessage(normalizedData, defaultMessage));
    this.status = status;
    this.data = normalizedData;
  }
}

type AuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
};

function clearSession(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  window.dispatchEvent(new CustomEvent('timeora:auth-expired'));
}

async function responseData(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => '');
  return text ? { detail: text } : {};
}

function requestSignal(external?: AbortSignal | null): {
  signal?: AbortSignal;
  dispose: () => void;
  didTimeout: () => boolean;
} {
  // Same-origin `/backend-api` uses DEFAULT_TIMEOUT_MS=0 → no client abort at all.
  // This prevents false "request took too long" when the browser was on a stale
  // bundle that aborted localhost:8000 after 15s.
  if (DEFAULT_TIMEOUT_MS <= 0 && !external) {
    return { signal: undefined, dispose: () => undefined, didTimeout: () => false };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId =
    DEFAULT_TIMEOUT_MS > 0
      ? window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, DEFAULT_TIMEOUT_MS)
      : null;
  const abortFromExternal = () => controller.abort(external?.reason);
  if (external?.aborted) {
    controller.abort(external.reason);
  } else {
    external?.addEventListener('abort', abortFromExternal, { once: true });
  }
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
      external?.removeEventListener('abort', abortFromExternal);
    },
  };
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    if (localStorage.getItem('token')) clearSession();
    return false;
  }
  const timeout = requestSignal();
  try {
    const resp = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: timeout.signal,
    });
    if (!resp.ok) {
      clearSession();
      return false;
    }
    const data = await resp.json() as AuthTokenResponse;
    if (data.access_token) {
      persistAuthTokens(data, { preserveRefreshToken: true });
      return true;
    }
    clearSession();
  } catch {
    clearSession();
    return false;
  } finally {
    timeout.dispose();
  }
  return false;
}

export async function fetchApi<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = localStorage.getItem('token');

  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  // Avoid Content-Type on GET — reduces unnecessary CORS preflight on absolute APIs.
  if (!headers.has('Content-Type') && !isFormData && options.body != null) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const url = `${API_BASE_URL}${endpoint}`;
  const timeout = requestSignal(options.signal);
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      ...(timeout.signal ? { signal: timeout.signal } : {}),
      cache: 'no-store',
    });
  } catch (error: unknown) {
    if (timeout.didTimeout()) {
      throw new ApiError(
        408,
        {
          detail: `[${API_CLIENT_BUILD}] Timeout after ${DEFAULT_TIMEOUT_MS}ms calling ${url}. Is backend :8000 running?`,
        },
        'Request timed out',
      );
    }
    throw new ApiError(
      0,
      {
        detail:
          error instanceof Error
            ? `[${API_CLIENT_BUILD}] ${error.message} (${url})`
            : `[${API_CLIENT_BUILD}] Network request failed (${url})`,
      },
      'Network request failed',
    );
  } finally {
    timeout.dispose();
  }

  if (response.status === 401 && retry && !endpoint.includes('/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return fetchApi<T>(endpoint, options, false);
  }

  if (!response.ok) {
    const errorData = await responseData(response);
    throw new ApiError(response.status, errorData, 'An error occurred while fetching data');
  }

  if (response.status === 204) {
    return null as T;
  }

  return responseData(response) as Promise<T>;
}

export type ParseResult = {
  intent?: string;
  title: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  participants?: string;
  recurrence?: string | null;
  category?: string | null;
  source?: 'ai' | 'fallback';
  warnings?: string[];
};

export type AssistantResult = {
  intent: string;
  result: unknown;
  message: string;
  requires_confirmation?: boolean;
  executed?: boolean;
  clarification?: {
    type: string;
    prompt: string;
    choices: Array<{
      id: string;
      title: string;
      date?: string | null;
      start_time?: string | null;
    }>;
  } | null;
  events?: ApiEvent[];
  suggested_actions?: string[];
};

export type AssistantExecuteParams = {
  event_id?: string;
  action: 'cancel' | 'reschedule' | 'create' | 'update';
  new_date?: string;
  new_time?: string;
  event_data?: Record<string, unknown>;
};

export async function parseEventNL(text: string): Promise<ParseResult> {
  return fetchApi<ParseResult>('/parse', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function callAssistant(
  text: string,
  options?: { selected_event_id?: string; context_event_id?: string },
): Promise<AssistantResult> {
  return fetchApi<AssistantResult>('/assistant', {
    method: 'POST',
    body: JSON.stringify({ text, ...options }),
  });
}

export async function executeAssistant(params: AssistantExecuteParams): Promise<AssistantResult> {
  return fetchApi<AssistantResult>('/assistant', {
    method: 'POST',
    body: JSON.stringify({
      confirm: true,
      event_id: params.event_id,
      action: params.action,
      new_date: params.new_date,
      new_time: params.new_time,
      event_data: params.event_data,
    }),
  });
}

export type InsightAction = {
  type: 'block_focus_time' | 'spread_load';
  label: string;
  description: string;
};

export type WeeklyInsight = {
  hours_per_day: Record<string, number>;
  total_hours: number;
  deep_work_blocks: Array<{
    date: string;
    start: string;
    end: string;
    duration_minutes: number;
  }>;
  fragmentation_score: number;
  suggestion: string;
  actions?: InsightAction[];
};

export type InsightActionResult = {
  action_type: string;
  message: string;
  event?: {
    id: string;
    title: string;
    date: string;
    start_time: string;
    duration_minutes: number;
  };
};

export async function fetchWeeklyInsights(refDate?: string): Promise<WeeklyInsight> {
  const qs = refDate ? `?date=${refDate}` : '';
  return fetchApi<WeeklyInsight>(`/analytics/week${qs}`);
}

export async function applyBlockFocusTime(refDate?: string): Promise<InsightActionResult> {
  const qs = refDate ? `?date=${refDate}` : '';
  return fetchApi<InsightActionResult>(`/analytics/actions/block-focus${qs}`, { method: 'POST' });
}

export async function applySpreadLoad(refDate?: string): Promise<InsightActionResult> {
  const qs = refDate ? `?date=${refDate}` : '';
  return fetchApi<InsightActionResult>(`/analytics/actions/spread-load${qs}`, { method: 'POST' });
}

export type AvailabilityCell = {
  day: string;
  hour: number;
  score: number;
  date: string;
};

export type AvailabilitySlot = {
  day: string;
  start_hour: number;
  end_hour: number;
  duration_hours: number;
};

export type AvailabilityHeatmapData = {
  days: string[];
  hours: number[];
  cells: AvailabilityCell[];
  best_slots: AvailabilitySlot[];
  availability_pct: number;
};

export async function fetchAvailabilityHeatmap(refDate?: string): Promise<AvailabilityHeatmapData> {
  const qs = refDate ? `?date=${refDate}` : '';
  return fetchApi<AvailabilityHeatmapData>(`/analytics/availability${qs}`);
}

export type ApiEvent = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  participants?: string;
  recurrence_rule?: string | null;
  category?: string | null;
  description: string;
  location_url?: string | null;
  priority: 'low' | 'normal' | 'important';
  tags: string[];
  reminder_minutes?: number | null;
  external_ids?: Record<string, string>;
  sync_status?: string;
  last_synced_at?: string | null;
};

export async function restoreEvent(eventId: string): Promise<ApiEvent> {
  return fetchApi<ApiEvent>(`/events/${eventId}/restore`, { method: 'POST' });
}

export async function fetchEventsExpanded(
  fromDate: string,
  toDate: string,
): Promise<ApiEvent[]> {
  const qs = new URLSearchParams({
    expand: 'true',
    from: fromDate,
    to: toDate,
  });
  return fetchApi<ApiEvent[]>(`/events?${qs.toString()}`);
}

export async function exportIcs(retry = true): Promise<Blob> {
  const token = localStorage.getItem('token');
  const timeout = requestSignal();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/export/ics`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(timeout.signal ? { signal: timeout.signal } : {}),
      cache: 'no-store',
    });
  } catch (error: unknown) {
    if (timeout.didTimeout()) {
      throw new ApiError(
        408,
        { detail: `[${API_CLIENT_BUILD}] Export timed out (${API_BASE_URL}/export/ics)` },
        'Export timed out',
      );
    }
    throw new ApiError(
      0,
      { detail: error instanceof Error ? error.message : 'Calendar export failed' },
      'Calendar export failed',
    );
  } finally {
    timeout.dispose();
  }
  if (response.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return exportIcs(false);
  }
  if (!response.ok) {
    const errorData = await responseData(response);
    throw new ApiError(response.status, errorData, 'Failed to export calendar');
  }
  return response.blob();
}

export type IcsImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
  events: ApiEvent[];
};

export async function importIcs(file: File): Promise<IcsImportResult> {
  const body = new FormData();
  body.append('file', file);
  return fetchApi<IcsImportResult>('/events/import-ics', {
    method: 'POST',
    body,
  });
}

export type IntegrationStatus = {
  provider: string;
  connected: boolean;
  enabled: boolean;
  configured: boolean;
  status: 'ready' | 'connected' | 'foundation_ready' | 'configuration_required' | string;
  metadata: Record<string, unknown>;
  updated_at?: string | null;
};

export type WebhookEventType =
  | 'event.created'
  | 'event.updated'
  | 'event.deleted'
  | 'event.restored';

export type WebhookSubscription = {
  id: string;
  url: string;
  event_types: WebhookEventType[];
  description: string;
  active: boolean;
  created_at?: string | null;
};

export type WebhookSubscriptionCreated = WebhookSubscription & {
  signing_secret: string;
};

export async function fetchIntegrations(): Promise<IntegrationStatus[]> {
  return fetchApi<IntegrationStatus[]>('/integrations');
}

export async function fetchWebhooks(): Promise<WebhookSubscription[]> {
  return fetchApi<WebhookSubscription[]>('/webhooks');
}

export async function createWebhook(input: {
  url: string;
  description?: string;
  event_types?: WebhookEventType[];
}): Promise<WebhookSubscriptionCreated> {
  return fetchApi<WebhookSubscriptionCreated>('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      url: input.url,
      description: input.description || '',
      event_types: input.event_types || [
        'event.created',
        'event.updated',
        'event.deleted',
      ],
    }),
  });
}

export async function deleteWebhook(subscriptionId: string): Promise<void> {
  await fetchApi(`/webhooks/${subscriptionId}`, { method: 'DELETE' });
}
