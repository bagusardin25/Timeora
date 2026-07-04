const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '');

export class ApiError extends Error {
  public status: number;
  public data: any;

  constructor(status: number, data: any, defaultMessage: string) {
    let msg = defaultMessage;
    if (data?.detail) {
      msg = typeof data.detail === 'string' ? data.detail : (data.detail.message || defaultMessage);
    }
    super(msg);
    this.status = status;
    this.data = data;
  }
}

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
    const data = await resp.json();
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

export async function fetchApi(endpoint: string, options: RequestInit = {}, retry = true) {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && retry && !endpoint.includes('/auth/')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return fetchApi(endpoint, options, false);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData, 'An error occurred while fetching data');
  }

  if (response.status === 204) {
    return null; // No content
  }

  return response.json();
}

export type ParseResult = {
  intent?: string;
  title: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  participants?: string;
  recurrence?: string | null;
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
  return fetchApi('/parse', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function callAssistant(text: string): Promise<AssistantResult> {
  return fetchApi('/assistant', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function executeAssistant(params: AssistantExecuteParams): Promise<AssistantResult> {
  return fetchApi('/assistant', {
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
  return fetchApi(`/analytics/week${qs}`);
}

export async function applyBlockFocusTime(refDate?: string): Promise<InsightActionResult> {
  const qs = refDate ? `?date=${refDate}` : '';
  return fetchApi(`/analytics/actions/block-focus${qs}`, { method: 'POST' });
}

export async function applySpreadLoad(refDate?: string): Promise<InsightActionResult> {
  const qs = refDate ? `?date=${refDate}` : '';
  return fetchApi(`/analytics/actions/spread-load${qs}`, { method: 'POST' });
}

export async function restoreEvent(eventId: string) {
  return fetchApi(`/events/${eventId}/restore`, { method: 'POST' });
}

export async function fetchEventsExpanded(fromDate: string, toDate: string) {
  const qs = new URLSearchParams({
    expand: 'true',
    from: fromDate,
    to: toDate,
  });
  return fetchApi(`/events?${qs.toString()}`);
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
