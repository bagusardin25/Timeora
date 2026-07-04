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

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
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
  source?: 'ai' | 'fallback';
  warnings?: string[];
};

export type AssistantResult = {
  intent: string;
  result: unknown;
  message: string;
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
};

export async function fetchWeeklyInsights(refDate?: string): Promise<WeeklyInsight> {
  const qs = refDate ? `?date=${refDate}` : '';
  return fetchApi(`/analytics/week${qs}`);
}

export async function restoreEvent(eventId: string) {
  return fetchApi(`/events/${eventId}/restore`, { method: 'POST' });
}
