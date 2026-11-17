import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';
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
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-[#2ED3C2]">Client Portal</div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Sign in to BizWave</h1>
          <p className="mt-2 text-sm text-slate-300">Access your isolated SME analytics, forecasts &amp; AI assistant.</p>
        </div>

        <div className="slide-card p-6 sm:p-8 rounded-2xl">
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
                {loading ? 'Signing in...' : mfaRequired ? 'Verify & Sign In' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="text-sm font-semibold text-white">Reset Your Password</div>
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

          <div className="mt-6 pt-5 border-t border-white/10 text-center text-xs text-slate-400">
            New to BizWave?{' '}
            <Link to="/register" className="font-semibold text-[#2ED3C2] hover:underline">
              Register your business
            </Link>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-[#2ED3C2]" />
          <span>Strict PostgreSQL tenant isolation · Record &amp; Analyse platform</span>
        </div>
      </div>
    </div>
  );
};
