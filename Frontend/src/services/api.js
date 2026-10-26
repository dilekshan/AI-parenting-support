const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export async function apiRequest(path, { token, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  } catch {
    throw new Error('Unable to reach the server. Please try again.');
  }
  let data;
  try { data = await response.json(); } catch {
    throw new Error(response.ok ? 'Invalid server response. Please try again.' : 'Request failed. Please try again.');
  }
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(Array.isArray(detail) ? detail.map(item => item.msg).join(' ') : typeof detail === 'string' ? detail : 'Request failed. Please try again.');
  }
  return data;
}
