import { authenticatedRequest } from './authService.js';
const pending = new Map();
export function getParentDashboard(userId) {
  if (!pending.has(userId)) {
    pending.set(userId, authenticatedRequest('/api/parent/dashboard', { timeoutMs: 15000, timeoutMessage: 'Dashboard request timed out. Please try again later.' }).finally(() => pending.delete(userId)));
  }
  return pending.get(userId);
}
