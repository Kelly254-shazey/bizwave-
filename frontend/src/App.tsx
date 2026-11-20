import React, { Component, Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './stores/authStore';
import { PublicLayout } from './layouts/PublicLayout';
import { AppLayout } from './layouts/AppLayout';
import { HomePage } from './pages/public/HomePage';

// Route-level code splitting: public visitors load HomePage immediately without downloading Portal or Recharts (400KB+)
const BenefitsPage = lazy(() => import('./pages/public/BenefitsPage').then((m) => ({ default: m.BenefitsPage })));
const HowItWorksPage = lazy(() => import('./pages/public/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage })));
const PricingPage = lazy(() => import('./pages/public/PricingPage').then((m) => ({ default: m.PricingPage })));
const ContactPage = lazy(() => import('./pages/public/ContactPage').then((m) => ({ default: m.ContactPage })));
const LoginPage = lazy(() => import('./pages/public/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/public/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const LegalPage = lazy(() => import('./pages/public/LegalPage').then((m) => ({ default: m.LegalPage })));

const SelectOrganizationPage = lazy(() =>
  import('./pages/app/SelectOrganizationPage').then((m) => ({ default: m.SelectOrganizationPage })),
);
const OnboardingPage = lazy(() => import('./pages/app/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const DashboardPage = lazy(() => import('./pages/app/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AnalyticsPage = lazy(() => import('./pages/app/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const PredictPage = lazy(() => import('./pages/app/PredictPage').then((m) => ({ default: m.PredictPage })));
const AiAssistantPage = lazy(() => import('./pages/app/AiAssistantPage').then((m) => ({ default: m.AiAssistantPage })));
const ConnectPage = lazy(() => import('./pages/app/ConnectPage').then((m) => ({ default: m.ConnectPage })));
const CustomerCommunicationsPage = lazy(() => import('./pages/app/CustomerCommunicationsPage').then((m) => ({ default: m.CustomerCommunicationsPage })));
const ReportsPage = lazy(() => import('./pages/app/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const TeamPage = lazy(() => import('./pages/app/TeamPage').then((m) => ({ default: m.TeamPage })));
const BillingPage = lazy(() => import('./pages/app/BillingPage').then((m) => ({ default: m.BillingPage })));
const SettingsPage = lazy(() => import('./pages/app/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader: React.FC = () => (
  <div className="min-h-[55vh] flex items-center justify-center bg-[#041527]">
    <div className="flex items-center gap-2.5 text-sm text-slate-300">
      <span className="w-4 h-4 rounded-full border-2 border-[#2ED3C2] border-t-transparent animate-spin" />
      Loading BizWave...
    </div>
  </div>
);

/** Always scroll to top on route navigation, or smoothly scroll to #hash anchor when present */
const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);
  return null;
};

class RouteErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#041527] text-white p-6">
          <div className="max-w-md w-full text-center space-y-4 slide-card rounded-2xl p-8">
            <h1 className="text-xl font-extrabold text-white">Something went wrong loading this view</h1>
            <p className="text-sm text-slate-300">
              Your business records are safe. Reload the page to continue cleanly.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-[#2ED3C2] text-[#041527] text-sm font-bold hover:bg-[#5ce2d4]"
            >
              Reload BizWave
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#041527] text-sm text-slate-300">
        Verifying BizWave session...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <RouteErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Official Public Website Routes */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/benefits" element={<BenefitsPage />} />
                <Route path="/how-it-works" element={<HowItWorksPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/privacy" element={<LegalPage mode="privacy" />} />
                <Route path="/terms" element={<LegalPage mode="terms" />} />
              </Route>

              {/* Multi-Org Selector */}
              <Route
                path="/app/select-organization"
                element={
                  <ProtectedRoute>
                    <SelectOrganizationPage />
                  </ProtectedRoute>
                }
              />

              {/* Private Personalized SME Client Portal Routes */}
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/app/dashboard" replace />} />
                <Route path="onboarding" element={<OnboardingPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="predict" element={<PredictPage />} />
                <Route path="ai" element={<AiAssistantPage />} />
                <Route path="connect" element={<ConnectPage />} />
                <Route path="customer-communications" element={<CustomerCommunicationsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="team" element={<TeamPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
