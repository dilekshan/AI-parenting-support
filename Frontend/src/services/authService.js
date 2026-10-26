import { apiRequest } from './api.js';
let accessToken = null;
let profile = null;
export async function login(credentials) {
  accessToken = null;
  profile = null;
  const data = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: credentials.email.trim(), password: credentials.password }) });
  if (typeof data?.access_token !== 'string' || !data.access_token || data.token_type !== 'bearer' || !Number.isInteger(data.user?.user_id)) throw new Error('Invalid login response. Please try again.');
  accessToken = data.access_token;
  profile = data.user;
  return data;
}
export async function register(details) {
  const data = await apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(details) });
  if (!Number.isInteger(data?.user?.user_id) || typeof data.message !== 'string') throw new Error('Invalid registration response. Please try again.');
  return data;
}
export async function getCurrentUser() {
  if (!accessToken) return null;
  try {
    profile = await apiRequest('/api/auth/me', { token: accessToken });
    return profile;
  } catch (error) {
    accessToken = null;
    profile = null;
    throw error;
  }
}
export function logout() { accessToken = null; profile = null; }

export async function authenticatedRequest(path, options = {}) {
  if (!accessToken) throw new Error("Please sign in to continue.");
  return apiRequest(path, { ...options, token: accessToken });
}
