// Requirements: 8.5
// OAuth callback handler - redirects to dashboard after auth

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // After OAuth callback completes, redirect to dashboard
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-600">Completing sign in...</p>
    </div>
  );
}
