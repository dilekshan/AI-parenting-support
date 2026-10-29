import { apiRequest } from './api.js';
let accessToken = null;
let profile = null;
// Authenticate the supplied credentials using the existing sign-in endpoint.
export async function login(credentials) {
  accessToken = null;
  profile = null;
  const data = await apiRequest('/api/auth/login', { timeoutMs: 15000, method: 'POST', body: JSON.stringify({ email: credentials.email.trim(), password: credentials.password }) });
  if (typeof data?.access_token !== 'string' || !data.access_token || data.token_type !== 'bearer' || !Number.isInteger(data.user?.user_id)) throw new Error('Invalid login response. Please try again.');
  accessToken = data.access_token;
  profile = data.user;
  return data;
}
// Create a parent account only after the submitted details are validated.
export async function register(details) {
  const data = await apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(details) });
  if (!Number.isInteger(data?.user?.user_id) || typeof data.message !== 'string') throw new Error('Invalid registration response. Please try again.');
  return data;
}
// Ask the backend for the account represented by the current session.
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
// Forget the in-memory credential and cached account information.
export function logout() { accessToken = null; profile = null; }

// Attach the existing session to a protected API request.
export async function authenticatedRequest(path, options = {}) {
  if (!accessToken) throw new Error("Please sign in to continue.");
  return apiRequest(path, { ...options, token: accessToken });
}

// Send the browser to the backend to begin Google authentication.
export function startGoogleLogin() {
  const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
  window.location.assign(`${baseUrl}/api/auth/google/start`);
}

// Share the in-flight exchange so React StrictMode does not consume the cookie twice.
let googleExchange = null;
// Exchange the short-lived Google handoff and verify the resulting parent account.
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

// Save the optional phone number using the authenticated session.
export function completeGoogleProfile(phone) {
  return authenticatedRequest('/api/auth/google/profile', { method: 'POST', body: JSON.stringify({ phone: phone || null }) });
}

// Send image bytes for the current account and update its cached photo URL.
export async function uploadProfilePhoto(file) {
  const sessionToken = accessToken;
  const result = await authenticatedRequest('/api/auth/me/profile-photo', {
    method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' }, timeoutMs: 15000,
    timeoutMessage: 'Photo upload timed out. Please try again.',
  });
  if (profile && accessToken === sessionToken) profile = { ...profile, profile_photo_url: result.profile_photo_url };
  return result;
}


export async function updateProfileName(name) {
  const sessionToken = accessToken;
  const result = await authenticatedRequest('/api/auth/me/name', {
    method: 'POST', body: JSON.stringify({ name }), timeoutMs: 15000,
    timeoutMessage: 'Name update timed out. Please try again.',
  });
  if (accessToken !== sessionToken) throw new Error('Your session changed. Please sign in again.');
  if (profile) profile = { ...profile, name: result.name };
  return result;
}
