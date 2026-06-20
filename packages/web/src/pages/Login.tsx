// Requirements: 8.5
// Login page with GitHub OAuth

export default function Login() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Solo Founder Launch OS</h1>
        <p className="text-gray-600 mb-8">Sign in to track your launch readiness.</p>
        <a
          href="/auth/github"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-md font-medium hover:bg-gray-800 transition-colors"
        >
          Sign in with GitHub
        </a>
      </div>
    </div>
  );
}
