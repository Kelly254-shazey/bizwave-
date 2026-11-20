import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Building2, ChevronDown, ChevronRight, CircleHelp, CreditCard, FileBarChart,
  FileUp, Globe2, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings2,
  Sparkles, TrendingUp, Users, Wallet, X,
} from 'lucide-react';
import { useAuth } from '../stores/authStore';
import '../styles/portal.css';

type NavItem = { to: string; label: string; icon: React.ElementType; visible: boolean; tab?: string; badge?: string };

export const AppLayout: React.FC = () => {
  const { user, organizations, activeOrg, branches, selectedBranchId, setSelectedBranchId, language, setLanguage, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sw = language === 'sw';
  const tr = (en: string, kiswahili: string) => sw ? kiswahili : en;

  useEffect(() => {
    document.documentElement.lang = sw ? 'sw' : 'en';
  }, [sw]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!sidebarOpen) return;
    closeButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const groups: { label: string; items: NavItem[] }[] = [
    { label: tr('WORKSPACE', 'NAFASI YA KAZI'), items: [
      { to: '/app/dashboard', label: tr('Overview', 'Muhtasari'), icon: LayoutDashboard, visible: true },
      { to: '/app/analytics?tab=sales', tab: 'sales', label: tr('Sales', 'Mauzo'), icon: Receipt, visible: hasPermission('sales:read') },
      { to: '/app/analytics?tab=finance', tab: 'finance', label: tr('Expenses', 'Matumizi'), icon: Wallet, visible: hasPermission('finance:read') },
      { to: '/app/analytics?tab=inventory', tab: 'inventory', label: tr('Inventory', 'Stoo'), icon: Package, visible: hasPermission('inventory:read') },
      { to: '/app/customer-communications', label: tr('Customers', 'Wateja'), icon: Users, visible: hasPermission('customers:read') || hasPermission('connect:read') },
      { to: '/app/analytics?tab=imports', tab: 'imports', label: tr('Data & imports', 'Data na faili'), icon: FileUp, visible: hasPermission('imports:read') },
    ]},
    { label: tr('INSIGHTS', 'UCHAMBUZI'), items: [
      { to: '/app/predict', label: tr('Forecasts', 'Utabiri'), icon: TrendingUp, badge: 'AI', visible: hasPermission('predict:sales') || hasPermission('predict:demand') || hasPermission('predict:cashflow') },
      { to: '/app/ai', label: tr('AI assistant', 'Msaidizi wa AI'), icon: Sparkles, badge: 'EN/SW', visible: hasPermission('ai:use') },
      { to: '/app/connect', label: tr('Business network', 'Mtandao wa biashara'), icon: Globe2, visible: hasPermission('connect:read') },
      { to: '/app/analytics?tab=website', tab: 'website', label: tr('Website sync', 'Unganisha tovuti'), icon: BarChart3, visible: hasPermission('analytics:read') },
    ]},
    { label: tr('MANAGE', 'SIMAMIA'), items: [
      { to: '/app/reports', label: tr('Reports', 'Ripoti'), icon: FileBarChart, visible: hasPermission('reports:read') },
      { to: '/app/team', label: tr('Team', 'Timu'), icon: Users, visible: hasPermission('users:read') },
      { to: '/app/settings', label: tr('Settings', 'Mipangilio'), icon: Settings2, visible: hasPermission('org:read') },
      { to: '/app/billing', label: tr('Subscription', 'Mpango wa malipo'), icon: CreditCard, visible: hasPermission('billing:read') || hasPermission('audit:read') },
    ]},
  ];
  const currentTab = new URLSearchParams(location.search).get('tab') || 'sales';
  const isActive = (item: NavItem) => item.tab
    ? location.pathname === '/app/analytics' && currentTab === item.tab
    : location.pathname === item.to;
  const currentLabel = groups.flatMap((group) => group.items).find(isActive)?.label || (location.pathname.includes('onboarding') ? tr('Business setup', 'Sanidi biashara') : tr('Workspace', 'Nafasi ya kazi'));
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || 'BW';
  const role = activeOrg?.roles?.[0]?.replace(/_/g, ' ') || tr('Member', 'Mwanachama');

  const handleLogout = async () => { await logout(); navigate('/login'); };
  const sidebar = (
    <div className="portal-sidebar-inner">
      <div className="portal-brand-row">
        <Link to="/app/dashboard" className="portal-brand" aria-label={tr('BizWave dashboard', 'Muhtasari wa BizWave')}>
          <svg className="portal-brand-mark" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="34" height="34" rx="10" />
            <path d="M8 11.5c3-2.8 5.3 2.8 8.3 0s5.3 2.8 8.3 0 3.4-.9 3.4-.9M8 18c3-2.8 5.3 2.8 8.3 0s5.3 2.8 8.3 0 3.4-.9 3.4-.9M8 24.5c3-2.8 5.3 2.8 8.3 0s5.3 2.8 8.3 0 3.4-.9 3.4-.9" />
          </svg>
          <span className="portal-brand-name">BIZ <em>WAVE</em></span>
          <span className="portal-brand-badge" aria-hidden="true">AI SME</span>
        </Link>
        <button ref={closeButtonRef} type="button" className="portal-icon-button lg:hidden" onClick={() => setSidebarOpen(false)} aria-label={tr('Close navigation', 'Funga menyu')}><X size={19} /></button>
      </div>
      <div className="portal-workspace-card">
        <div className="portal-workspace-icon"><Building2 size={17} /></div>
        <div className="min-w-0 flex-1">
          <div className="portal-workspace-label">{tr('YOUR BUSINESS', 'BIASHARA YAKO')}</div>
          <div className="portal-workspace-name" title={activeOrg?.display_name}>{activeOrg?.display_name || activeOrg?.name || 'BizWave'}</div>
        </div>
        {organizations.length > 1 && <button type="button" className="portal-icon-button" onClick={() => navigate('/app/select-organization')} aria-label={tr('Switch business', 'Badili biashara')}><ChevronDown size={16} /></button>}
      </div>
      <nav className="portal-nav" aria-label={tr('Main navigation', 'Menyu kuu')}>
        {groups.map((group) => {
          const items = group.items.filter((item) => item.visible);
          if (!items.length) return null;
          return <div className="portal-nav-group" key={group.label}>
            <div className="portal-nav-heading">{group.label}</div>
            {items.map((item) => {
              const Icon = item.icon;
              return <Link key={item.to} to={item.to} aria-current={isActive(item) ? 'page' : undefined} className={`portal-nav-link ${isActive(item) ? 'is-active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span className="portal-nav-label">{item.label}</span>{item.badge && <span className="portal-nav-badge" aria-hidden="true">{item.badge}</span>}</Link>;
            })}
          </div>;
        })}
      </nav>
      <div className="portal-sidebar-bottom">
        <Link to="/contact" className="portal-support-link"><CircleHelp size={17} />{tr('Help & support', 'Msaada')}</Link>
        <div className="portal-user-row">
          <div className="portal-avatar">{initials}</div>
          <div className="min-w-0 flex-1"><div className="portal-user-name">{user?.firstName} {user?.lastName}</div><div className="portal-user-role">{role}</div></div>
          <button type="button" className="portal-icon-button" onClick={handleLogout} title={tr('Sign out', 'Toka')} aria-label={tr('Sign out', 'Toka')}><LogOut size={17} /></button>
        </div>
      </div>
    </div>
  );

  return <div className="portal">
    <aside className="portal-sidebar hidden lg:block">{sidebar}</aside>
    {sidebarOpen && <div className="portal-mobile-drawer lg:hidden" role="dialog" aria-modal="true" aria-label={tr('Navigation', 'Menyu')}>
      <button type="button" className="portal-drawer-backdrop" aria-label={tr('Close navigation', 'Funga menyu')} onClick={() => setSidebarOpen(false)} />
      <aside className="portal-drawer-panel">{sidebar}</aside>
    </div>}
    <div className="portal-shell">
      <header className="portal-topbar">
        <div className="portal-topbar-left">
          <button type="button" className="portal-icon-button lg:hidden" onClick={() => setSidebarOpen(true)} aria-label={tr('Open navigation', 'Fungua menyu')}><Menu size={21} /></button>
          <div className="portal-breadcrumb"><span>{tr('WORKSPACE', 'NAFASI YA KAZI')}</span><ChevronRight size={14} /><strong>{currentLabel}</strong></div>
        </div>
        <div className="portal-topbar-right">
          {activeOrg && (organizations.length > 1 ? <Link to="/app/select-organization" className="portal-business-chip" aria-label={tr('Switch business', 'Badili biashara')} title={activeOrg.display_name || activeOrg.name}>
            <Building2 size={15} /><span className="portal-business-name">{activeOrg.display_name || activeOrg.name}</span>{activeOrg.currency_code && <span className="portal-currency">{activeOrg.currency_code}</span>}<ChevronDown size={13} />
          </Link> : <div className="portal-business-chip" title={activeOrg.display_name || activeOrg.name}>
            <Building2 size={15} /><span className="portal-business-name">{activeOrg.display_name || activeOrg.name}</span>{activeOrg.currency_code && <span className="portal-currency">{activeOrg.currency_code}</span>}
          </div>)}
          {branches.length > 0 && <label className="portal-branch-picker"><Building2 size={15} /><span className="sr-only">{tr('Select branch', 'Chagua tawi')}</span><select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
            {branches.length > 1 && <option value="all">{tr('All branches', 'Matawi yote')}</option>}
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select><ChevronDown size={14} /></label>}
          <button type="button" className="portal-language" onClick={() => setLanguage(sw ? 'en' : 'sw')} aria-label={tr('Switch to Kiswahili', 'Badili kwenda Kiingereza')} title={tr('Switch to Kiswahili', 'Badili kwenda Kiingereza')}><Globe2 size={16} /><span>{sw ? 'SW' : 'EN'}</span><ChevronDown size={13} /></button>
          <div className="portal-header-user"><div className="portal-header-user-text"><strong>{user?.firstName} {user?.lastName}</strong><span>{user?.email}</span></div><div className="portal-avatar small">{initials}</div></div>
        </div>
      </header>
      {activeOrg && hasPermission('org:manage') && !activeOrg.onboarding_completed && !location.pathname.includes('/onboarding') && <div className="portal-setup-banner"><span>{tr('Finish setting up your business to get the most from BizWave.', 'Kamilisha usanidi wa biashara yako ili kutumia BizWave kikamilifu.')}</span><Link to="/app/onboarding">{tr('Continue setup', 'Endelea na usanidi')} <ChevronRight size={15} /></Link></div>}
      <main className="portal-page" id="main-content"><Outlet /></main>
    </div>
  </div>;
};
