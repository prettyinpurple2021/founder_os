// Requirements: 8.5
// Root app component with React Router configuration

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Checklist from './pages/Checklist';
import Content from './pages/Content';
import Marketing from './pages/Marketing';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Authenticated routes with layout */}
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/content" element={<Content />} />
          <Route path="/marketing" element={<Marketing />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
