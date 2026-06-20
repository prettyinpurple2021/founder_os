// Requirements: 1.1, 6.3, 6.4, 7.1, 7.2, 9.1
// Root app component with React Router, auth context, and protected routes

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.js';
import ProtectedRoute from './components/ProtectedRoute.js';
import Layout from './components/Layout.js';
import Dashboard from './pages/Dashboard.js';
import Login from './pages/Login.js';
import AuthCallback from './pages/AuthCallback.js';
import Checklist from './pages/Checklist.js';
import Content from './pages/Content.js';
import DraftDetail from './pages/DraftDetail.js';
import Marketing from './pages/Marketing.js';
import Settings from './pages/Settings.js';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Authenticated routes with layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/checklist" element={<Checklist />} />
            <Route path="/content" element={<Content />} />
            <Route path="/content/:id" element={<DraftDetail />} />
            <Route path="/marketing" element={<Marketing />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
