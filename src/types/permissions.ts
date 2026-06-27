/**
 * Permission system types for FundedWealth Admin OS.
 * Permissions follow the format: resource.action
 */

export const RESOURCES = [
  'users',
  'purchases',
  'payments',
  'payouts',
  'kyc',
  'risk',
  'settings',
  'challenges',
  'trades',
  'affiliates',
  'support',
  'marketing',
  'audit',
  'staff',
  'certificates',
  'system',
  'revenue',
] as const;

export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = [
  'view',
  'edit',
  'manage',
  'approve',
  'reject',
  'ban',
  'delete',
] as const;

export type Action = (typeof ACTIONS)[number];

export type Permission = `${Resource}.${Action}`;

/** All supported permissions in the system */
export const ALL_PERMISSIONS: Permission[] = [
  'users.view',
  'users.edit',
  'users.ban',
  'users.delete',
  'purchases.view',
  'purchases.manage',
  'payments.view',
  'payments.manage',
  'payouts.view',
  'payouts.approve',
  'payouts.reject',
  'kyc.view',
  'kyc.approve',
  'kyc.reject',
  'risk.view',
  'risk.manage',
  'settings.view',
  'settings.edit',
  'challenges.view',
  'challenges.manage',
  'trades.view',
  'affiliates.view',
  'affiliates.manage',
  'support.view',
  'support.manage',
  'marketing.view',
  'marketing.manage',
  'audit.view',
  'staff.view',
  'staff.manage',
  'certificates.view',
  'certificates.manage',
  'system.view',
  'system.manage',
  'revenue.view',
];

/** System role identifiers */
export const SYSTEM_ROLES = [
  'founder',
  'co_founder',
  'operations_manager',
  'finance_manager',
  'risk_manager',
  'support_agent',
  'marketing_manager',
  'affiliate_manager',
  'compliance_officer',
  'developer',
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Roles that have full unrestricted access */
export const FULL_ACCESS_ROLES: SystemRole[] = ['founder', 'co_founder'];
