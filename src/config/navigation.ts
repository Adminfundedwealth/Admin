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
      {
        label: 'Executive Command',
        icon: 'LayoutDashboard',
        href: '/executive',
        permission: 'revenue.view',
      },
      {
        label: 'Staff Activity',
        icon: 'Activity',
        href: '/founder/activity',
        permission: null,
      },
      {
        label: 'Emergency Controls',
        icon: 'ShieldCheck',
        href: '/founder/emergency',
        permission: null,
      },
    ],
  },
  {
    label: 'Commerce',
    items: [
      {
        label: 'Purchase Orders',
        icon: 'ShoppingCart',
        href: '/purchases',
        permission: 'purchases.view',
        badge: { query: 'purchases_pending' },
      },
      {
        label: 'Payments',
        icon: 'CreditCard',
        href: '/payments',
        permission: 'payments.view',
        badge: { query: 'payments_failed' },
      },
      {
        label: 'Manual Provision',
        icon: 'UserCog',
        href: '/provision',
        permission: null,
      },
    ],
  },
  {
    label: 'User Operations',
    items: [
      {
        label: 'User Intelligence',
        icon: 'Users',
        href: '/users',
        permission: 'users.view',
      },
      {
        label: 'Challenge Operations',
        icon: 'Trophy',
        href: '/challenges',
        permission: 'challenges.view',
        badge: { query: 'challenges_pending_review' },
      },
      {
        label: 'Funded Traders',
        icon: 'TrendingUp',
        href: '/funded',
        permission: 'challenges.view',
        badge: { query: 'funded_at_risk' },
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        label: 'Payout Operations',
        icon: 'Wallet',
        href: '/payouts',
        permission: 'payouts.view',
        badge: { query: 'payouts_pending' },
      },
      {
        label: 'Revenue Intelligence',
        icon: 'BarChart3',
        href: '/revenue',
        permission: 'revenue.view',
      },
    ],
  },
  {
    label: 'Compliance',
    items: [
      {
        label: 'KYC Verification',
        icon: 'ShieldCheck',
        href: '/kyc',
        permission: 'kyc.view',
        badge: { query: 'kyc_pending' },
      },
      {
        label: 'Risk Management',
        icon: 'AlertTriangle',
        href: '/risk',
        permission: 'risk.view',
        badge: { query: 'risk_alerts_open' },
      },
      {
        label: 'Audit & Compliance',
        icon: 'FileText',
        href: '/audit',
        permission: 'audit.view',
      },
    ],
  },
  {
    label: 'Trading',
    items: [
      {
        label: 'Trade Surveillance',
        icon: 'Activity',
        href: '/trades',
        permission: 'trades.view',
      },
      {
        label: 'Trading Orders',
        icon: 'ListOrdered',
        href: '/orders',
        permission: 'trades.view',
        badge: { query: 'orders_rejected_unacked' },
      },
    ],
  },
  {
    label: 'Growth',
    items: [
      {
        label: 'Affiliate Operations',
        icon: 'Link',
        href: '/affiliates',
        permission: 'affiliates.view',
        badge: { query: 'affiliate_payouts_pending' },
      },
      {
        label: 'Marketing Operations',
        icon: 'Megaphone',
        href: '/marketing',
        permission: 'marketing.view',
      },
    ],
  },
  {
    label: 'Support',
    items: [
      {
        label: 'Support Operations',
        icon: 'Headphones',
        href: '/support',
        permission: 'support.view',
        badge: { query: 'tickets_open' },
      },
      {
        label: 'Certificate Center',
        icon: 'Award',
        href: '/certificates',
        permission: 'certificates.view',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'System Monitoring',
        icon: 'Monitor',
        href: '/monitoring',
        permission: 'system.view',
        badge: { query: 'services_degraded' },
      },
      {
        label: 'Staff Management',
        icon: 'UserCog',
        href: '/staff',
        permission: 'staff.view',
      },
      {
        label: 'Configuration',
        icon: 'Settings',
        href: '/settings',
        permission: 'settings.view',
      },
    ],
  },
];
