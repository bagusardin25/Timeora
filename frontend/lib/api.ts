const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '');

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

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;
  try {
    const resp = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!resp.ok) return false;
    const data = await resp.json() as AuthTokenResponse;
    if (data.access_token) {
      localStorage.setItem('token', data.access_token);
      if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
      return true;
    }
  } catch {
    return false;
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
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && retry && !endpoint.includes('/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return fetchApi<T>(endpoint, options, false);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData, 'An error occurred while fetching data');
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
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
};

export type AssistantExecuteParams = {
  event_id: string;
  action: 'cancel' | 'reschedule';
  new_date?: string;
  new_time?: string;
};

export async function parseEventNL(text: string): Promise<ParseResult> {
  return fetchApi<ParseResult>('/parse', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function callAssistant(text: string): Promise<AssistantResult> {
  return fetchApi<AssistantResult>('/assistant', {
    method: 'POST',
    body: JSON.stringify({ text }),
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

export async function exportIcs(): Promise<Blob> {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}/export/ics`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData, 'Failed to export calendar');
  }
  return response.blob();
}
