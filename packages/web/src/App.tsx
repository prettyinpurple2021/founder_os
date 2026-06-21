// Requirements: 1.1, 6.3, 6.4, 7.1, 7.2, 8.1, 9.1
// Root app component with React Router, auth context, and protected routes.
// Route-level code splitting via React.lazy() + dynamic imports (Requirement 8.1).

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.js';
import ProtectedRoute from './components/ProtectedRoute.js';
import Layout from './components/Layout.js';

// Route-level code splitting: each page is loaded on demand via dynamic import.
// This produces separate chunks per route, reducing the initial bundle size.
const Dashboard = lazy(() => import('./pages/Dashboard.js'));
const Login = lazy(() => import('./pages/Login.js'));
const AuthCallback = lazy(() => import('./pages/AuthCallback.js'));
const Checklist = lazy(() => import('./pages/Checklist.js'));
const Content = lazy(() => import('./pages/Content.js'));
const DraftDetail = lazy(() => import('./pages/DraftDetail.js'));
const Marketing = lazy(() => import('./pages/Marketing.js'));
const Settings = lazy(() => import('./pages/Settings.js'));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense
          fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}
        >
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
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
