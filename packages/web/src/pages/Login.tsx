// Requirements: 11.1, 11.2, 11.3, 11.4, 14.3
// Landing page with LaunchChrome™ design language.
// Features hero section, product features, and GitHub OAuth CTA.

import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function DiamondEdgeCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative group ${className}`}>
      {/* Chrome border with neon edge lighting */}
      <div className="absolute inset-0 rounded-sm bg-gradient-to-br from-chrome-silver/20 via-dark-chrome/40 to-chrome-silver/10 p-[1px]">
        <div className="absolute top-0 left-0 right-1/2 h-[1px] bg-gradient-to-r from-founder-pink/60 to-transparent" />
        <div className="absolute bottom-0 right-0 left-1/2 h-[1px] bg-gradient-to-l from-launch-lime/60 to-transparent" />
        <div className="h-full w-full bg-carbon rounded-sm" />
      </div>
      <div className="relative p-6">{children}</div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <DiamondEdgeCard className="motion-safe:hover:-translate-y-1 motion-safe:transition-transform motion-safe:duration-standard">
      <div className="text-founder-pink mb-3">{icon}</div>
      <h3 className="font-display text-h4 text-chrome-white mb-2">{title}</h3>
      <p className="text-body text-text-secondary leading-relaxed">{description}</p>
    </DiamondEdgeCard>
  );
}

function MomentumBar({ label, value, color }: { label: string; value: number; color: 'pink' | 'lime' | 'cyan' }) {
  const colorClasses = {
    pink: 'bg-founder-pink shadow-glow-pink',
    lime: 'bg-launch-lime shadow-glow-lime',
    cyan: 'bg-hyper-cyan shadow-glow-cyan',
  };
  return (
    <div className="flex items-center gap-3">
      <span className="text-small text-text-muted w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gunmetal rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClasses[color]} motion-safe:animate-charge`}
          style={{ '--charge-target': `${value}%`, width: `${value}%` } as React.CSSProperties}
        />
      </div>
      <span className="text-small text-chrome-white font-medium w-10 text-right">{value}%</span>
    </div>
  );
}

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center">
        <div className="inline-block h-8 w-8 animate-pulse-pink rounded-full border-4 border-founder-pink border-r-transparent" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-obsidian overflow-x-hidden">
      {/* Background atmosphere */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-founder-pink/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-launch-lime/4 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#050608_70%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 py-5 max-w-content mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-sm bg-gradient-to-br from-founder-pink to-launch-lime" />
            <span className="font-display text-h4 text-chrome-white tracking-tight">FounderLaunch<span className="text-founder-pink">OS</span></span>
          </div>
          <a
            href="/auth/github"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-small font-medium text-chrome-white border border-dark-chrome rounded-sm hover:border-chrome-steel motion-safe:transition-colors motion-safe:duration-fast"
          >
            <GithubIcon className="w-4 h-4" />
            Sign In
          </a>
        </nav>

        {/* Hero */}
        <section className="px-6 pt-16 pb-24 max-w-content mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 border border-dark-chrome rounded-full text-caption text-text-secondary">
            <span className="w-2 h-2 rounded-full bg-launch-lime animate-pulse" />
            Built for solo founders who ship
          </div>

          <h1 className="font-display text-display-l md:text-display-xl text-chrome-white mb-6 tracking-tight max-w-4xl mx-auto">
            Your Launch
            <span className="bg-gradient-to-r from-founder-pink to-neon-magenta bg-clip-text text-transparent"> Command </span>
            Center
          </h1>

          <p className="text-body-l text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
            Track your product progress from GitHub. Know exactly when you&apos;re ready to launch. Generate build-in-public content that writes itself.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a
              href="/auth/github"
              className="group relative inline-flex items-center gap-3 px-8 py-4 min-h-[52px] bg-gradient-to-r from-founder-pink to-neon-magenta text-chrome-white rounded-sm font-display font-medium text-body-l shadow-glow-pink hover:shadow-[0_0_40px_rgba(255,43,166,0.5)] motion-safe:transition-all motion-safe:duration-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hyper-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian"
            >
              <GithubIcon className="w-5 h-5" />
              Launch with GitHub
              <span className="absolute inset-0 rounded-sm bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-standard" />
            </a>
            <span className="text-small text-text-muted">Free for solo founders · No credit card</span>
          </div>

          {/* Demo momentum panel */}
          <div className="max-w-lg mx-auto">
            <DiamondEdgeCard>
              <div className="flex items-center justify-between mb-4">
                <span className="font-display text-small text-chrome-white uppercase tracking-wider">Launch Readiness</span>
                <span className="text-caption text-launch-lime font-medium">72% Ready</span>
              </div>
              <div className="space-y-3">
                <MomentumBar label="Product" value={88} color="pink" />
                <MomentumBar label="Quality" value={75} color="cyan" />
                <MomentumBar label="Marketing" value={52} color="lime" />
              </div>
            </DiamondEdgeCard>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-24 max-w-comfortable mx-auto">
          <h2 className="font-display text-h2 text-chrome-white text-center mb-4">
            Everything You Need to <span className="text-launch-lime">Launch</span>
          </h2>
          <p className="text-body text-text-secondary text-center max-w-xl mx-auto mb-16">
            One connected system that turns your GitHub activity into launch intelligence.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              }
              title="GitHub Sync"
              description="Automatically tracks issues, PRs, commits, and status checks. Your progress updates itself."
            />
            <FeatureCard
              icon={
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              }
              title="Launch Checklist"
              description="Know exactly what's blocking your launch. Product, quality, deployment, legal, marketing — all tracked."
            />
            <FeatureCard
              icon={
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              }
              title="Content Engine"
              description="Generate Twitter, LinkedIn, and blog drafts from your actual shipped progress. Never fabricate content."
            />
            <FeatureCard
              icon={
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              }
              title="Progress Dashboard"
              description="See your momentum at a glance. Current status, blockers, next actions, and recent wins — all in one view."
            />
            <FeatureCard
              icon={
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                </svg>
              }
              title="Marketing Intel"
              description="Suggests missing marketing assets based on your launch stage. Practical actions you can execute alone."
            />
            <FeatureCard
              icon={
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              }
              title="Secure by Default"
              description="OAuth only. Encrypted tokens. No passwords stored. Your GitHub data stays private and under your control."
            />
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="px-6 py-24 max-w-content mx-auto text-center">
          <div className="relative max-w-2xl mx-auto">
            <DiamondEdgeCard className="py-12 px-8">
              <h2 className="font-display text-h2 text-chrome-white mb-4">Ready to Launch?</h2>
              <p className="text-body text-text-secondary mb-8 max-w-md mx-auto">
                Connect your GitHub repo and see your launch readiness in under 60 seconds.
              </p>
              <a
                href="/auth/github"
                className="group relative inline-flex items-center gap-3 px-8 py-4 min-h-[52px] bg-gradient-to-r from-founder-pink to-neon-magenta text-chrome-white rounded-sm font-display font-medium text-body-l shadow-glow-pink hover:shadow-[0_0_40px_rgba(255,43,166,0.5)] motion-safe:transition-all motion-safe:duration-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hyper-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian"
              >
                <GithubIcon className="w-5 h-5" />
                Activate Founder Mode
                <span className="absolute inset-0 rounded-sm bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-standard" />
              </a>
            </DiamondEdgeCard>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 py-8 border-t border-gunmetal">
          <div className="max-w-content mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-small text-text-muted">© 2026 FounderLaunch OS</span>
            <div className="flex items-center gap-6">
              <span className="text-caption text-text-muted">Built for founders who ship.</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
