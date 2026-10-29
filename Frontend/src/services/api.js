export const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
// Send a request and turn network or response failures into readable errors.
async function request(path, { token, ...options } = {}) {
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

// Timeout is opt-in so unrelated requests retain their existing behavior.
export async function apiRequest(path, { timeoutMs, timeoutMessage, ...options } = {}) {
  if (!timeoutMs) return request(path, options);
  const controller = new AbortController();
  let timer;
  try {
    // Let either the completed response or the timeout end the pending request.
    return await Promise.race([
      request(path, { ...options, signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage || 'Sign-in request timed out. Please check your connection and try again.'));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
