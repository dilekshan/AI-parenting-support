import { apiRequest } from './api.js';

export function requestPasswordReset(email, challengeId) {
  const body = { email };
  if (challengeId) body.challenge_id = challengeId;
  return apiRequest('/api/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: 15000,
    timeoutMessage: 'Password reset request timed out. Please try again.',
  });
}

export function verifyPasswordReset({ challengeId, otp, newPassword, confirmNewPassword }) {
  return apiRequest('/api/auth/password-reset/verify', {
    method: 'POST',
    body: JSON.stringify({
      challenge_id: challengeId,
      otp,
      new_password: newPassword,
      confirm_new_password: confirmNewPassword,
    }),
    timeoutMs: 15000,
    timeoutMessage: 'Verification timed out. Please try again.',
  });
}