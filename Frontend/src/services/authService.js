import { apiRequest } from './api.js';
let accessToken = null;
let profile = null;
export async function login(credentials) {
  accessToken = null;
  profile = null;
  const data = await apiRequest('/api/auth/login', { timeoutMs: 15000, method: 'POST', body: JSON.stringify({ email: credentials.email.trim(), password: credentials.password }) });
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
    profile = await apiRequest('/api/auth/me', { token: accessToken, timeoutMs: 15000 });
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

export function startGoogleLogin() {
  const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
  window.location.assign(`${baseUrl}/api/auth/google/start`);
}

// Share the in-flight exchange so React StrictMode does not consume the cookie twice.
let googleExchange = null;
export function finishGoogleLogin() {
  if (!googleExchange) {
    accessToken = null;
    profile = null;
    googleExchange = apiRequest('/api/auth/google/exchange', { method: 'POST', credentials: 'include' })
      .then(async data => {
        if (typeof data?.access_token !== 'string' || !data.access_token || data.token_type !== 'bearer'
            || typeof data.new_user !== 'boolean' || !Number.isInteger(data.user?.user_id)) {
          throw new Error('Invalid Google login response. Please try again.');
        }
        accessToken = data.access_token;
        const user = await getCurrentUser();
        if (user?.role !== 'parent' || user.account_status !== 'active') {
          logout();
          throw new Error('Google login is available only for active parent accounts.');
        }
        return { user, new_user: data.new_user };
      }).catch(error => {
        logout();
        throw error;
      }).finally(() => { googleExchange = null; });
  }
  return googleExchange;
}

export function completeGoogleProfile(phone) {
  return authenticatedRequest('/api/auth/google/profile', { method: 'POST', body: JSON.stringify({ phone: phone || null }) });
}

export async function uploadProfilePhoto(file) {
  const sessionToken = accessToken;
  const result = await authenticatedRequest('/api/auth/me/profile-photo', {
    method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' }, timeoutMs: 15000,
    timeoutMessage: 'Photo upload timed out. Please try again.',
  });
  if (profile && accessToken === sessionToken) profile = { ...profile, profile_photo_url: result.profile_photo_url };
  return result;
}
