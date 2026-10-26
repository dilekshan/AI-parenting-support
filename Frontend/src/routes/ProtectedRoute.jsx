import { cloneElement, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getCurrentUser } from '../services/authService.js';

export default function ProtectedRoute({ children, requiredRole = 'parent' }) {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    let active = true;
    getCurrentUser().then(profile => {
      if (active) setUser(profile);
    }).catch(() => {
      if (active) setUser(null);
    });
    return () => { active = false; };
  }, []);
  if (user === undefined) return null;
  if (!user || !['parent', 'admin'].includes(user.role) || user.account_status !== 'active') {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== requiredRole) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/parent/home'} replace />;
  }
  return cloneElement(children, { user });
}
