import { authenticatedRequest } from './authService.js';

export async function getDashboardSummary() {
  const data = await authenticatedRequest('/api/admin/dashboard/summary');
  const keys = ['total_children', 'total_parents', 'active_users', 'subscription_users'];
  if (!data || !keys.every(key => data[key] === null || (Number.isSafeInteger(data[key]) && data[key] >= 0))) {
    throw new Error('Invalid dashboard summary response. Please reload to try again.');
  }
  return data;
}

export async function getRecentRegistrations() {
  const data = await authenticatedRequest('/api/admin/dashboard/recent-registrations');
  if (!Array.isArray(data) || !data.every(row => Number.isSafeInteger(row.user_id)
    && typeof row.name === 'string' && ['parent', 'admin'].includes(row.role)
    && typeof row.created_at === 'string' && !Number.isNaN(Date.parse(row.created_at)))) {
    throw new Error('Invalid recent registrations response. Please reload to try again.');
  }
  return data;
}
