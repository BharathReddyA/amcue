const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('amcue_token');
}

export async function apiFetch(path, { method = 'GET', body, isFormData = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export function setToken(token) {
  localStorage.setItem('amcue_token', token);
}

export function clearToken() {
  localStorage.removeItem('amcue_token');
}

export function isLoggedIn() {
  return Boolean(getToken());
}
