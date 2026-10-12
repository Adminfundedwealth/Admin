import type { Permission } from '@/types/permissions';

export interface NavigationItem {
  label: string;
  icon: string;
  href: string;
  permission: Permission | null;
  badge?: { query: string };
  children?: NavigationItem[];
}

export interface NavigationSection {
  label: string;
  items: NavigationItem[];
}

export const sidebarNavigation: NavigationSection[] = [
  {
    label: 'Founder',
    items: [
      { label: 'Executive Command',           icon: 'LayoutDashboard',  href: '/executive',                 permission: 'revenue.view' as Permission },
      { label: 'Staff Activity',              icon: 'Activity',         href: '/founder/activity',          permission: null },
      { label: 'Emergency Controls',          icon: 'ShieldCheck',      href: '/founder/emergency',         permission: null },
      { label: 'Emergency Manual Provision',  icon: 'UserCog',          href: '/founder/emergency-provision', permission: null },
      { label: 'Account Control',             icon: 'SlidersHorizontal', href: '/founder/account-control',  permission: null },
      { label: 'Link Terminal Account',       icon: 'Link',              href: '/founder/terminal-account-link', permission: null },
      { label: 'Delete / Archive Accounts',   icon: 'Trash2',           href: '/founder/delete-accounts',   permission: null },
      { label: 'Discount Code Manager',       icon: 'Tag',              href: '/founder/discount-config',   permission: null },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { label: 'Purchase Orders', icon: 'ShoppingCart', href: '/purchases', permission: 'purchases.view' as Permission, badge: { query: 'purchases_pending' } },
      { label: 'Payments',        icon: 'CreditCard',   href: '/payments',  permission: 'payments.view' as Permission,  badge: { query: 'payments_failed' } },
      { label: 'Manual Provision', icon: 'UserCog',     href: '/provision', permission: null },
    ],
  },
  {
    label: 'User Operations',
    items: [
      { label: 'User Intelligence',    icon: 'Users',      href: '/users',       permission: 'users.view' as Permission },
      { label: 'Challenge Operations', icon: 'Trophy',     href: '/challenges',  permission: 'challenges.view' as Permission, badge: { query: 'challenges_pending_review' } },
      { label: 'Funded Traders',       icon: 'TrendingUp', href: '/funded',      permission: 'challenges.view' as Permission, badge: { query: 'funded_at_risk' } },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Payout Operations',   icon: 'Wallet',    href: '/payouts', permission: 'payouts.view' as Permission, badge: { query: 'payouts_pending' } },
      { label: 'Revenue Intelligence', icon: 'BarChart3', href: '/revenue', permission: 'revenue.view' as Permission },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { label: 'KYC Verification',  icon: 'ShieldCheck',    href: '/kyc',   permission: 'kyc.view' as Permission,   badge: { query: 'kyc_pending' } },
      { label: 'Risk Management',   icon: 'AlertTriangle',  href: '/risk',  permission: 'risk.view' as Permission,  badge: { query: 'risk_alerts_open' } },
      { label: 'Audit & Compliance', icon: 'FileText',      href: '/audit', permission: 'audit.view' as Permission },
    ],
  },
  {
    label: 'Risk Rules Engine',
    items: [
      { label: 'Overview',      icon: 'Shield',       href: '/risk-rules',         permission: 'risk.view' as Permission },
      { label: 'Flash',         icon: 'Zap',          href: '/risk-rules/flash',   permission: 'risk.view' as Permission },
      { label: 'Instant',       icon: 'TrendingUp',   href: '/risk-rules/instant', permission: 'risk.view' as Permission },
      { label: '1-Step',        icon: 'BarChart3',    href: '/risk-rules/onestep', permission: 'risk.view' as Permission },
      { label: '2-Step',        icon: 'Layers',       href: '/risk-rules/twostep', permission: 'risk.view' as Permission },
      { label: 'Audit History', icon: 'FileText',     href: '/risk-rules/audit',   permission: 'risk.view' as Permission },
    ],
  },
  {
    label: 'Trading',
    items: [
      { label: 'Trade Surveillance', icon: 'Activity',     href: '/trades', permission: 'trades.view' as Permission },
      { label: 'Trading Orders',     icon: 'ListOrdered',  href: '/orders', permission: 'trades.view' as Permission, badge: { query: 'orders_rejected_unacked' } },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Affiliate Operations',  icon: 'Link',     href: '/affiliates', permission: 'affiliates.view' as Permission, badge: { query: 'affiliate_payouts_pending' } },
      { label: 'Marketing Operations',  icon: 'Megaphone', href: '/marketing', permission: 'marketing.view' as Permission },
    ],
  },
  {
    label: 'Support',
    items: [
      { label: 'Support Operations', icon: 'Headphones', href: '/support',      permission: 'support.view' as Permission,      badge: { query: 'tickets_open' } },
      { label: 'Certificate Center', icon: 'Award',      href: '/certificates', permission: 'certificates.view' as Permission },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'System Monitoring', icon: 'Monitor',  href: '/monitoring', permission: 'system.view' as Permission, badge: { query: 'services_degraded' } },
      { label: 'Staff Management',  icon: 'UserCog',  href: '/staff',      permission: 'staff.view' as Permission },
      { label: 'Configuration',     icon: 'Settings', href: '/settings',   permission: 'settings.view' as Permission },
    ],
  },
];