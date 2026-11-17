import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, KeyRound, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { loginSuccess } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email, password, ...(mfaCode ? { mfaCode } : {}) },
        skipAuth: true,
      });

      if (res.mfaRequired) {
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      await loginSuccess(res);

      if (res.organizations.length > 1) {
        navigate('/app/select-organization');
      } else if (res.organizations[0] && !res.organizations[0].onboarding_completed) {
        navigate('/app/onboarding');
      } else {
        navigate('/app/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg('');
    try {
      const res = await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: { email: resetEmail },
        skipAuth: true,
      });
      setResetMsg(res.message);
    } catch (err: any) {
      setResetMsg(err.message);
    }
  };

  return (
    <div className="py-16 sm:py-24 px-4 bg-[#041527] text-white">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left: Unique Workspace Access Message */}
        <div className="lg:col-span-6 space-y-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Private Command Center</div>
            <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Welcome Back to Your <span className="text-[#2ED3C2]">Decision Workspace.</span>
            </h1>
            <div className="teal-bar mt-4" />
            <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed">
              Sign in to review today&apos;s health score, track recorded sales &amp; M-Pesa inflows, check low-stock warnings, and ask BizWave AI what to act on next.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {[
              { icon: Lock, title: 'Strictly Isolated Workspace', desc: 'Your records stay cryptographically separated from every other business via PostgreSQL Row-Level Security.' },
              { icon: Building2, title: 'Multi-Branch & Role Scoped', desc: 'Automatically loads only the branches and modules authorized for your role.' },
              { icon: Sparkles, title: 'Bilingual AI Ready (EN / SW)', desc: 'Jump straight into Executive Briefings and What-If Scenarios grounded in your latest uploads.' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 p-3.5 rounded-xl bg-[#081F37]/80 border border-white/10">
                <item.icon className="w-4 h-4 text-[#2ED3C2] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">{item.title}</div>
                  <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Clean Sign In Card */}
        <div className="lg:col-span-6">
          <div className="slide-card p-6 sm:p-8 rounded-2xl">
            <h2 className="text-lg font-bold text-white mb-1">{showReset ? 'Reset Password' : 'Sign In'}</h2>
            <p className="text-xs text-slate-400 mb-6">
              {showReset ? 'We will send password reset steps to your registered email.' : 'Enter your registered business account credentials.'}
            </p>

            {!showReset ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#041527] border border-white/15 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:border-[#2ED3C2]"
                    placeholder="you@business.co.ke"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-200">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowReset(true)}
                      className="text-xs font-medium text-[#2ED3C2] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#041527] border border-white/15 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:border-[#2ED3C2]"
                    placeholder="••••••••"
                  />
                </div>

                {mfaRequired && (
                  <div className="p-3.5 rounded-xl bg-[#2ED3C2]/10 border border-[#2ED3C2]/30 space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#2ED3C2]">
                      <KeyRound className="w-3.5 h-3.5" /> 6-Digit Authenticator Code (MFA)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm tracking-widest bg-[#041527] border border-[#2ED3C2]/40 text-white rounded-lg"
                      placeholder="123456"
                    />
                  </div>
                )}

                {error && <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs">{error}</div>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4] disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Signing in...' : mfaRequired ? 'Verify & Sign In' : 'Sign In to Portal'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#041527] border border-white/15 text-white rounded-lg"
                  placeholder="Enter your registered email"
                />
                {resetMsg && <div className="p-3 rounded-lg bg-white/10 text-xs text-slate-200">{resetMsg}</div>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReset(false)}
                    className="flex-1 py-2.5 rounded-lg border border-white/20 text-xs font-semibold text-white"
                  >
                    Back to Sign In
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-lg bg-[#2ED3C2] text-[#041527] text-xs font-bold"
                  >
                    Send Instructions
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
              <span>New to BizWave?</span>
              <Link to="/register" className="font-semibold text-[#2ED3C2] hover:underline">
                Register your business →
              </Link>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-[#2ED3C2]" />
            <span>Protected by Argon2id, rotating sessions &amp; optional TOTP MFA</span>
          </div>
        </div>
      </div>
    </div>
  );
};
