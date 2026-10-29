import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/auth/Login.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import Register from './pages/auth/Register.jsx';
import GoogleCallback from './pages/auth/GoogleCallback.jsx';
import Landing from './pages/Landing.jsx';
import Home from './pages/parent/Home.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';

// Choose the page for each URL and protect dashboard routes.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/parent/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/google/callback" element={<GoogleCallback />} />
        <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}
