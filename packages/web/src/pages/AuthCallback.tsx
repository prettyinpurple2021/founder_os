// Requirements: 1.1, 1.4, 9.1
// OAuth callback handler: handles successful auth redirect and OAuth errors.

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDescription || 'Authentication failed. Please try again.');
      return;
    }

    // Auth succeeded — refresh session state and go to dashboard
    void checkSession().then(() => {
      navigate('/', { replace: true });
    });
  }, [navigate, searchParams, checkSession]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
            <span className="text-red-600 text-xl">✕</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Sign in failed</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/auth/github"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-md font-medium hover:bg-gray-800 transition-colors"
          >
            Try again
          </a>
          <div className="mt-4">
            <a href="/login" className="text-sm text-gray-500 hover:text-gray-700 underline">
              Back to login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        <p className="mt-4 text-sm text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}
