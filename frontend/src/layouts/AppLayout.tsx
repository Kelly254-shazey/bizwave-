import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Building2,
  ChevronRight,
  CreditCard,
  FileSpreadsheet,
  Globe,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../stores/authStore';
import { BrandLogo } from '../components/BrandLogo';
import { formatKes, t } from '../i18n/translations';
import { apiRequest } from '../services/api';

export const AppLayout: React.FC = () => {
  const {
    user,
    organizations,
    activeOrg,
    branches,
    selectedBranchId,
    setSelectedBranchId,
    language,
    setLanguage,
    logout,
    hasPermission,
    hasFeature,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any | null>(null);
  const [showNotif, setShowNotif] = useState(false);

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await apiRequest(`/analytics/search?q=${encodeURIComponent(val.trim())}`);
      setSearchResults(res);
    } catch {
      setSearchResults(null);
    }
  };

  // Streamlined 4-Pillar SME Client Portal Navigation (Zero clutter, zero Learn/Community)
  const navGroups = [
    {
      heading: language === 'sw' ? 'Nguzo za BizWave' : 'BizWave Intelligence',
      items: [
        { to: '/app/dashboard', label: t(language, 'app_dashboard'), icon: LayoutDashboard, show: true, locked: false },
        {
          to: '/app/analytics',
          label: t(language, 'app_analytics'),
          icon: BarChart3,
          show: hasPermission('analytics:read') || hasPermission('sales:read') || hasPermission('inventory:read'),
          locked: false,
        },
        {
          to: '/app/predict',
          label: t(language, 'app_predict'),
          icon: TrendingUp,
          show: hasPermission('predict:sales') || hasPermission('predict:demand') || hasPermission('predict:cashflow'),
          locked: !hasFeature('predict_basic'),
        },
        {
          to: '/app/ai',
          label: t(language, 'app_ai'),
          icon: Sparkles,
          show: hasPermission('ai:use'),
          locked: !hasFeature('ai_assistant'),
        },
        {
          to: '/app/connect',
          label: t(language, 'app_connect'),
          icon: MessageSquare,
          show: hasPermission('connect:read') || hasPermission('customers:read'),
          locked: !hasFeature('connect_core'),
        },
      ],
    },
    {
      heading: language === 'sw' ? 'Usimamizi wa Akaunti' : 'Business & Plan',
      items: [
        { to: '/app/reports', label: t(language, 'app_reports'), icon: FileSpreadsheet, show: hasPermission('reports:read'), locked: false },
        {
          to: '/app/billing',
          label: language === 'sw' ? 'Mpango & Huduma' : 'Subscription & Services',
          icon: CreditCard,
          show: hasPermission('billing:read') || hasPermission('audit:read'),
          locked: false,
        },
        { to: '/app/team', label: t(language, 'app_team'), icon: Users, show: hasPermission('users:read'), locked: false },
        { to: '/app/settings', label: t(language, 'app_settings'), icon: Settings, show: hasPermission('org:read'), locked: false },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show) }))
    .filter((g) => g.items.length > 0);

  const flatItems = navGroups.flatMap((g) => g.items);
  const currentPageLabel =
    flatItems.find((i) => location.pathname.startsWith(i.to))?.label ||
    (location.pathname.includes('onboarding') ? 'Business Setup' : 'Overview');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Presentation-matched Deep Midnight Navy Sidebar (#041527) + Mint-Teal (#2ED3C2) active indicators
  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#041527] text-slate-200 border-r border-white/10 w-64">
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
        <Link to="/app/dashboard" className="min-w-0">
          <BrandLogo
            variant="light"
            customName={activeOrg?.display_name || activeOrg?.name}
            customLogoUrl={activeOrg?.logo_url}
            brandColor="#2ED3C2"
            size="sm"
          />
        </Link>
        <button
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {activeOrg && (
        <div className="px-4 py-3.5 border-b border-white/10">
          <div className="flex items-center justify-between text-[11px]">
            <span className="uppercase tracking-wider font-bold text-[#041527] bg-[#2ED3C2] px-2.5 py-0.5 rounded-full">
              {activeOrg.plan_code}
            </span>
            <span className="text-slate-400 capitalize">{activeOrg.industry_code.replace('_', ' ')}</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 truncate capitalize">
            {activeOrg.roles.map((r) => r.replace(/_/g, ' ')).join(', ')}
          </div>
          {organizations.length > 1 && (
            <button
              type="button"
              onClick={() => navigate('/app/select-organization')}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
            >
              <Building2 className="w-3.5 h-3.5 text-[#2ED3C2]" />
              {t(language, 'switch_org')} ({organizations.length})
            </button>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.heading}>
            <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {group.heading}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                        isActive
                          ? 'bg-[#2ED3C2] text-[#041527] font-bold shadow-sm'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </span>
                    {item.locked && <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Non-custodial Record & Analyse Clarity Pill */}
      <div className="px-3 pb-2">
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] text-slate-400 leading-relaxed flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-[#2ED3C2] shrink-0 mt-0.5" />
          <span>Record &amp; Analyse Workspace. Only BizWave plan &amp; service fees are billed.</span>
        </div>
      </div>

      <div className="p-3 border-t border-white/10">
        <div className="px-3 py-1.5 mb-1">
          <div className="text-xs font-semibold text-white truncate">
            {user?.firstName} {user?.lastName}
          </div>
          <div className="text-[11px] text-slate-400 truncate">{user?.email}</div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {t(language, 'sign_out')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F4F7FA] text-slate-900">
      <aside className="hidden lg:block shrink-0 sticky top-0 h-screen">{SidebarContent}</aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-[#041527]/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10">{SidebarContent}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>

            {branches.length > 0 && (
              <select
                aria-label="Select Branch"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs sm:text-[13px] font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 max-w-[210px] truncate focus:outline-none focus:border-teal-600"
              >
                {branches.length > 1 && <option value="all">{t(language, 'all_branches')}</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            )}

            <div className="relative hidden md:block w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onBlur={() => setTimeout(() => setSearchResults(null), 200)}
                placeholder={t(language, 'search_placeholder')}
                className="w-full pl-9 pr-3 py-1.5 text-[13px] bg-slate-100 border border-transparent rounded-lg focus:outline-none focus:bg-white focus:border-slate-300 transition-colors"
              />
              {searchResults && (
                <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 text-xs space-y-2 max-h-72 overflow-y-auto">
                  {searchResults.products?.length > 0 && (
                    <div>
                      <div className="font-semibold text-slate-400 uppercase text-[10px] mb-1">Products</div>
                      {searchResults.products.map((p: any) => (
                        <div key={p.id} className="py-1 flex justify-between text-slate-700">
                          <span>{p.name}</span>
                          <span className="font-medium">{formatKes(p.selling_price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.customers?.length > 0 && (
                    <div>
                      <div className="font-semibold text-slate-400 uppercase text-[10px] mb-1">Customers</div>
                      {searchResults.customers.map((c: any) => (
                        <div key={c.id} className="py-1 flex justify-between text-slate-700">
                          <span>{c.full_name}</span>
                          <span className="text-slate-400">{c.phone_number}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.sales?.length > 0 && (
                    <div>
                      <div className="font-semibold text-slate-400 uppercase text-[10px] mb-1">Recorded Sales</div>
                      {searchResults.sales.map((s: any) => (
                        <div key={s.id} className="py-1 flex justify-between text-slate-700">
                          <code>{s.transaction_ref}</code>
                          <span className="font-medium">{formatKes(s.total_amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!searchResults.products?.length && !searchResults.customers?.length && !searchResults.sales?.length && (
                    <div className="text-slate-400 py-1">No matching records in {activeOrg?.display_name}.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'sw' : 'en')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
              title="Switch English / Kiswahili"
            >
              <Globe className="w-3.5 h-3.5 text-teal-600" />
              {language === 'en' ? 'EN' : 'SW'}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotif((v) => !v)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-navy-950 relative"
                aria-label="Alerts"
              >
                <Bell className="w-4 h-4" />
                <span className="w-2 h-2 rounded-full bg-[#2ED3C2] absolute top-1.5 right-1.5" />
              </button>
              {showNotif && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 z-50 text-xs space-y-2">
                  <div className="font-semibold text-navy-950">Decision Alerts</div>
                  <div className="p-2.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200/60">
                    Check <strong>Analytics → Inventory</strong> for low-stock replenishment needs.
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 text-slate-600">
                    Isolated tenant security active for <strong>{activeOrg?.display_name}</strong>.
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {activeOrg && !activeOrg.onboarding_completed && !location.pathname.includes('/onboarding') && (
          <div className="bg-[#041527] text-white px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-white/10">
            <span>{t(language, 'onboarding_banner')} (Step {activeOrg.onboarding_step}/11)</span>
            <Link
              to="/app/onboarding"
              className="px-3.5 py-1 rounded-lg bg-[#2ED3C2] hover:bg-[#5ce2d4] text-[#041527] font-bold transition-colors"
            >
              {t(language, 'continue_setup')}
            </Link>
          </div>
        )}

        <div className="px-4 sm:px-6 pt-4 pb-1 flex items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span>{activeOrg?.display_name || 'BizWave'}</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-700 font-semibold">{currentPageLabel}</span>
          </div>
          <span className="hidden sm:inline text-[11px] text-slate-500">
            Business records for analysis &amp; decision making
          </span>
        </div>

        <main className="flex-1 p-4 sm:p-6 max-w-[1360px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
