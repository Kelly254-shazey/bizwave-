import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Shield } from 'lucide-react';
import { useAuth } from '../../stores/authStore';

export const SelectOrganizationPage: React.FC = () => {
  const { organizations, selectOrganization, user } = useAuth();
  const navigate = useNavigate();

  const handleChoose = async (tenantId: string, onboardingCompleted: boolean) => {
    await selectOrganization(tenantId);
    navigate(onboardingCompleted ? '/app/dashboard' : '/app/onboarding');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-navy-950 text-teal-400 flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-navy-950">Select Your Workspace</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Signed in as <strong>{user?.email}</strong>. Choose which authorized organization to open.
          </p>
        </div>

        <div className="space-y-3">
          {organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => handleChoose(org.id, org.onboarding_completed)}
              className="w-full text-left p-5 rounded-2xl bg-white border border-slate-200 hover:border-teal-500 hover:shadow-sm transition-all flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: org.brand_color || '#0D9488' }}
                >
                  {org.display_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-navy-950 truncate">{org.display_name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 capitalize">
                    {org.industry_code.replace('_', ' ')} · {org.plan_code} plan · {org.currency_code}
                  </div>
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">
                    <Shield className="w-3 h-3 text-teal-600" />
                    {org.roles.map((r) => r.replace(/_/g, ' ')).join(', ')}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
