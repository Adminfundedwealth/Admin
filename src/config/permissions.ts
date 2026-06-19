import type { Permission, SystemRole } from '@/types/permissions';

/**
 * Default role permission mappings.
 * Founder and Co-Founder have full access (handled in RBAC engine, not here).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<SystemRole, 'founder' | 'co_founder'>, Permission[]> = {
  operations_manager: [
    'users.view', 'users.edit', 'users.ban',
    'payouts.view',
    'kyc.view',
    'risk.view',
    'settings.view',
    'challenges.view', 'challenges.manage',
    'trades.view',
    'affiliates.view',
    'support.view', 'support.manage',
    'marketing.view',
    'certificates.view', 'certificates.manage',
    'system.view',
    'staff.view',
    'revenue.view',
  ],
  finance_manager: [
    'users.view',
    'payouts.view', 'payouts.approve', 'payouts.reject',
    'risk.view',
    'settings.view',
    'challenges.view',
    'trades.view',
    'affiliates.view',
    'revenue.view',
  ],
  risk_manager: [
    'users.view', 'users.ban',
    'risk.view', 'risk.manage',
    'settings.view',
    'challenges.view',
    'trades.view',
  ],
  support_agent: [
    'users.view',
    'challenges.view',
    'support.view', 'support.manage',
  ],
  marketing_manager: [
    'marketing.view', 'marketing.manage',
  ],
  affiliate_manager: [
    'affiliates.view', 'affiliates.manage',
  ],
  compliance_officer: [
    'users.view',
    'payouts.view',
    'kyc.view', 'kyc.approve', 'kyc.reject',
    'risk.view',
    'challenges.view',
    'trades.view',
    'audit.view',
  ],
  developer: [
    'settings.view',
    'system.view', 'system.manage',
  ],
};

/**
 * Route to permission mapping for middleware authorization.
 */
export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  '/executive': 'revenue.view',
  '/users': 'users.view',
  '/challenges': 'challenges.view',
  '/funded': 'challenges.view',
  '/payouts': 'payouts.view',
  '/kyc': 'kyc.view',
  '/risk': 'risk.view',
  '/trades': 'trades.view',
  '/orders': 'trades.view',
  '/affiliates': 'affiliates.view',
  '/revenue': 'revenue.view',
  '/support': 'support.view',
  '/marketing': 'marketing.view',
  '/certificates': 'certificates.view',
  '/monitoring': 'system.view',
  '/audit': 'audit.view',
  '/staff': 'staff.view',
  '/settings': 'settings.view',
};
