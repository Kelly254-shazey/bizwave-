import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './stores/authStore';
import { PublicLayout } from './layouts/PublicLayout';
import { AppLayout } from './layouts/AppLayout';
import { HomePage } from './pages/public/HomePage';
import { BenefitsPage } from './pages/public/BenefitsPage';
import { HowItWorksPage } from './pages/public/HowItWorksPage';
import { ContactPage } from './pages/public/ContactPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';
import { LegalPage } from './pages/public/LegalPage';
import { SelectOrganizationPage } from './pages/app/SelectOrganizationPage';
import { OnboardingPage } from './pages/app/OnboardingPage';
import { DashboardPage } from './pages/app/DashboardPage';
import { AnalyticsPage } from './pages/app/AnalyticsPage';
import { PredictPage } from './pages/app/PredictPage';
import { AiAssistantPage } from './pages/app/AiAssistantPage';
import { ConnectPage } from './pages/app/ConnectPage';
import { ReportsPage } from './pages/app/ReportsPage';
import { TeamPage } from './pages/app/TeamPage';
import { BillingPage } from './pages/app/BillingPage';
import { SettingsPage } from './pages/app/SettingsPage';

const queryClient = new QueryClient();

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
        <Routes>
          {/* Official Public Website Routes */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/benefits" element={<BenefitsPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
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
            <Route path="reports" element={<ReportsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
