import { Language } from '../types';

export const translations: Record<Language, Record<string, string>> = {
  en: {
    nav_home: 'Home',
    nav_benefits: 'Benefits',
    nav_how: 'How It Works',
    nav_contact: 'Contact',
    nav_login: 'Login',
    nav_register: 'Register',
    app_dashboard: 'Dashboard',
    app_analytics: 'Analytics & Data',
    app_predict: 'Predict',
    app_ai: 'BizWave AI',
    app_connect: 'Connect',
    app_reports: 'Reports',
    app_team: 'Team & Roles',
    app_billing: 'Billing & Audit',
    app_settings: 'Settings',
    all_branches: 'All Authorized Branches',
    search_placeholder: 'Search products, customers, receipts...',
    total_revenue: 'Total Revenue',
    total_expenses: 'Total Expenses',
    gross_profit: 'Gross Profit',
    net_profit: 'Net Profit',
    order_volume: 'Order Volume',
    avg_order_value: 'Avg Order Value',
    vs_prev: 'vs prior period',
    sign_out: 'Sign out',
    switch_org: 'Switch Organization',
    onboarding_banner: 'Complete your business onboarding to unlock all personalized insights.',
    continue_setup: 'Continue Setup',
  },
  sw: {
    nav_home: 'Nyumbani',
    nav_benefits: 'Faida',
    nav_how: 'Jinsi Inavyofanya Kazi',
    nav_contact: 'Wasiliana',
    nav_login: 'Ingia',
    nav_register: 'Jisajili',
    app_dashboard: 'Dashibodi',
    app_analytics: 'Takwimu na Data',
    app_predict: 'Utabiri (Predict)',
    app_ai: 'BizWave AI',
    app_connect: 'Mawasiliano',
    app_reports: 'Ripoti',
    app_team: 'Timu na Majukumu',
    app_billing: 'Malipo na Ukaguzi',
    app_settings: 'Mipangilio',
    all_branches: 'Matawi Yote Yanayoruhusiwa',
    search_placeholder: 'Tafuta bidhaa, wateja, risiti...',
    total_revenue: 'Jumla ya Mapato',
    total_expenses: 'Jumla ya Matumizi',
    gross_profit: 'Faida Ghafi',
    net_profit: 'Faida Halisi',
    order_volume: 'Idadi ya Oda',
    avg_order_value: 'Wastani wa Oda',
    vs_prev: 'dhidi ya kipindi kilichopita',
    sign_out: 'Toka',
    switch_org: 'Badili Biashara',
    onboarding_banner: 'Kamilisha usajili wa biashara yako ili kufungua takwimu zote.',
    continue_setup: 'Endelea na Mipangilio',
  },
};

export function t(lang: Language, key: string): string {
  return translations[lang]?.[key] || translations.en[key] || key;
}

export function formatKes(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `KES ${Number(value).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}
