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

export async function parseEventNL(text: string) {
  return fetchApi('/parse', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}
