import React, { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../stores/authStore';

export const PublicLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-[13px] font-medium transition-colors ${
      isActive ? 'text-[#2ED3C2] font-semibold' : 'text-slate-300 hover:text-white'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-[#041527] text-white">
      {/* Midnight Navy glass navigation matching BizWave presentation */}
      <header className="sticky top-0 z-40 navy-glass border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" aria-label="BizWave Home" className="shrink-0">
            <BrandLogo variant="light" size="md" brandColor="#2ED3C2" />
          </Link>

          <nav className="hidden md:flex items-center gap-7" aria-label="Primary Navigation">
            <NavLink to="/" end className={linkClass}>
              Home
            </NavLink>
            <NavLink to="/benefits" className={linkClass}>
              Why BizWave
            </NavLink>
            <NavLink to="/how-it-works" className={linkClass}>
              How It Works
            </NavLink>
            <a href="/#pricing" className="text-[13px] font-medium text-slate-300 hover:text-white transition-colors">
              Pricing
            </a>
            <NavLink to="/contact" className={linkClass}>
              Contact
            </NavLink>
            <div className="h-4 w-px bg-white/15" />
            {user ? (
              <Link
                to="/app/dashboard"
                className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-[#2ED3C2] text-[#041527] hover:bg-[#5ce2d4] transition-colors"
              >
                Open Client Portal
              </Link>
            ) : (
              <>
                <NavLink to="/login" className={linkClass}>
                  Sign In
                </NavLink>
                <Link
                  to="/register"
                  className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-[#2ED3C2] text-[#041527] hover:bg-[#5ce2d4] transition-colors"
                >
                  Register Business
                </Link>
              </>
            )}
          </nav>

          <button
            type="button"
            className="md:hidden p-2 rounded-lg text-slate-200 hover:bg-white/10"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#061B31] px-5 py-4 space-y-2.5">
            <NavLink to="/" end onClick={() => setMobileOpen(false)} className="block py-1.5 text-sm font-medium text-slate-200">
              Home
            </NavLink>
            <NavLink to="/benefits" onClick={() => setMobileOpen(false)} className="block py-1.5 text-sm font-medium text-slate-200">
              Why BizWave
            </NavLink>
            <NavLink to="/how-it-works" onClick={() => setMobileOpen(false)} className="block py-1.5 text-sm font-medium text-slate-200">
              How It Works
            </NavLink>
            <a href="/#pricing" onClick={() => setMobileOpen(false)} className="block py-1.5 text-sm font-medium text-slate-200">
              Pricing
            </a>
            <NavLink to="/contact" onClick={() => setMobileOpen(false)} className="block py-1.5 text-sm font-medium text-slate-200">
              Contact
            </NavLink>
            <div className="pt-3 border-t border-white/10 flex items-center gap-3">
              {user ? (
                <Link
                  to="/app/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="w-full text-center py-2.5 text-sm font-semibold rounded-lg bg-[#2ED3C2] text-[#041527]"
                >
                  Open Client Portal
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 text-center py-2.5 text-sm font-medium border border-white/20 rounded-lg text-white"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 text-center py-2.5 text-sm font-semibold rounded-lg bg-[#2ED3C2] text-[#041527]"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* Clean Midnight Navy Footer */}
      <footer className="border-t border-white/10 bg-[#03101F] text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-3">
            <BrandLogo variant="light" size="sm" brandColor="#2ED3C2" />
            <p className="text-sm text-slate-400 max-w-md leading-relaxed">
              Autonomous business intelligence and customer communications for SMEs. Built for Nairobi SMEs, designed to scale across Kenya.
            </p>
            <p className="text-xs text-slate-500 max-w-md">
              BizWave records and analyses your business operations to guide smarter decisions. No customer payments pass through BizWave — billing applies exclusively to BizWave subscriptions and platform add-on services.
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-white mb-2">Platform</div>
            <Link to="/benefits" className="block hover:text-[#2ED3C2]">Why BizWave</Link>
            <Link to="/how-it-works" className="block hover:text-[#2ED3C2]">How It Works</Link>
            <a href="/#pricing" className="block hover:text-[#2ED3C2]">Plans &amp; Services</a>
            <Link to="/contact" className="block hover:text-[#2ED3C2]">Contact &amp; Pilots</Link>
          </div>
          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-white mb-2">Client Access &amp; Trust</div>
            <Link to="/register" className="block hover:text-[#2ED3C2]">Register Your Business</Link>
            <Link to="/login" className="block hover:text-[#2ED3C2]">Client Portal Sign In</Link>
            <Link to="/privacy" className="block hover:text-[#2ED3C2]">Privacy &amp; Kenya DPA 2019</Link>
            <Link to="/terms" className="block hover:text-[#2ED3C2]">Terms of Service</Link>
          </div>
        </div>
        <div className="border-t border-white/5 py-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} BizWave · Nairobi, Kenya · AI-Powered SME Intelligence Platform
        </div>
      </footer>
    </div>
  );
};
