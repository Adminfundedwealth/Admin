# Implementation Plan: Admin Account Provisioning

## Overview

This plan transforms the FundedWealth Admin Panel from a read-only dashboard into the single operational control center and exclusive account provisioning authority. Implementation follows a dependency-respecting order: testing infrastructure → security/auth hardening → core domain engines → API layer → UI pages → integration wiring.

## Tasks

- [ ] 1. Set up testing infrastructure and core types
  - [ ] 1.1 Install vitest and fast-check, configure vitest for the project
    - Add `vitest`, `@vitest/coverage-v8`, and `fast-check` to devDependencies
    - Create `vitest.config.ts` with path aliases matching `tsconfig.json`
    - Add `"test": "vitest --run"` and `"test:watch": "vitest"` scripts to `package.json`
    - Create `src/__tests__/` directory structure: `properties/`, `unit/`, `integration/`
    - _Requirements: Design Testing Strategy_

  - [ ] 1.2 Add new database types and extend existing types
    - Add `ProvisioningQueueEntry`, `ChallengeRule`, `FundedAccountRule`, `TerminalAccount`, `FeatureFlag`, `KycSubmission` interfaces to `src/types/database.ts`
    - Add `ProvisioningStatus` type union
    - Extend `ChallengeAccount` with `platform_account_id`, `server_name`, `login_id`, `provisioning_queue_id`
    - Extend `FundedAccount` with `platform_account_id`, `server_name`, `login_id`, `scaling_multiplier`
    - Extend `User` with `suspension_reason`, `suspension_timestamp`
    - _Requirements: 1.2, 2.2, 7.2, 7.5_

  - [ ] 1.3 Add new permissions to the permissions type system
    - Add `challenges.create`, `challenges.override`, `funded.create`, `funded.manage`, `users.suspend`, `payments.verify`, `payments.override`, `risk.critical`, `staff.create` to `src/types/permissions.ts`
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8_

  - [ ] 1.4 Create Zod validation schemas
    - Create `src/lib/provisioning/schemas.ts` with `IngestOrderSchema`, `CreateChallengeSchema`, `ChallengeRuleSchema`, `CreateFundedSchema`, `SuspendUserSchema`, `BanUserSchema`, `RiskResolveSchema`, `PaymentOverrideSchema`
    - Include all range/constraint validations from requirements (account_size 1000-10M, profit_target 1-100, etc.)
    - Add `.refine()` for max_trading_days >= min_trading_days
    - _Requirements: 1.6, 3.2, 4.6, 4.7, 6.4, 10.1, 11.2_

  - [ ]* 1.5 Write property test for input validation (Property 3)
    - **Property 3: Input Validation Rejects Invalid Data**
    - Generate payloads with random missing/invalid fields using fast-check arbitraries
    - Verify schema `.safeParse()` returns `success: false` for all invalid inputs
    - **Validates: Requirements 1.6, 3.2, 4.6, 4.7**

- [ ] 2. Security hardening — Authentication and middleware enforcement

  - [ ] 2.1 Remove middleware auth bypass and enforce session validation
    - Remove the `return NextResponse.next()` dev bypass in `src/middleware.ts`
    - Implement session token extraction from cookies
    - Validate session existence, idle timeout (30 min), and max age (8 hours)
    - Redirect page requests to `/login` on auth failure, return 401 for API routes
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [ ] 2.2 Create API handler wrapper with auth + RBAC enforcement
    - Create `src/lib/api/handler.ts` implementing `withAuth()` wrapper
    - Extract staff ID from session, check permission via `rbacEngine.hasPermission()`
    - Log denied access attempts to audit_records
    - Inject `staffId` and `staffRole` into handler context
    - _Requirements: 18.5, 19.1, 19.4, 20.1-20.9_

  - [ ] 2.3 Create session identity extraction utility
    - Create `src/lib/api/session.ts` with `extractStaffId(request)` helper
    - Validate token, check expiry, refresh last_activity on valid access
    - Return null for invalid/expired sessions
    - _Requirements: 19.1, 19.2, 19.3_

  - [ ]* 2.4 Write property test for session validation (Property 7)
    - **Property 7: Session Validation Invariant**
    - Generate sessions with random ages (0-12h) and idle times (0-60min)
    - Verify expired (>8h) and idle (>30min) sessions are rejected
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5**

  - [ ]* 2.5 Write property test for RBAC enforcement (Property 5)
    - **Property 5: RBAC Permission Enforcement**
    - Generate random (endpoint, permission-set) pairs without required permission
    - Verify 403 is returned and no DB write occurs
    - Verify Founder/Co-Founder bypass returns true for all permissions
    - **Validates: Requirements 3.5, 4.5, 5.8, 6.9, 11.1, 13.5, 14.5, 15.2, 15.3, 20.1-20.9**

  - [ ]* 2.6 Write property test for Founder/Co-Founder bypass (Property 24)
    - **Property 24: Founder/Co-Founder RBAC Bypass**
    - Generate random permission strings for staff with Founder/Co-Founder role
    - Verify `hasPermission()` always returns true regardless of assignments
    - **Validates: Requirements 20.9**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Audit logging service

  - [ ] 4.1 Create centralized audit logger service
    - Create `src/lib/audit/logger.ts` with `AuditLogger` class
    - Implement `log(record)` method that inserts into `audit_records` table
    - Implement `logDenied(record)` for permission denial tracking
    - Actor ID must come from session (never hardcoded placeholder)
    - Actor role must be the staff member's highest-privilege role name
    - _Requirements: 19.2, 19.5, 23.1, 23.2, 23.3, 23.4_

  - [ ]* 4.2 Write property test for audit record creation (Property 6)
    - **Property 6: Audit Record Creation on Every Mutation**
    - Execute mock mutations, verify audit_records entry exists with correct actor_id, actor_role, previous_state, and new_state
    - Verify actor_id is never the hardcoded placeholder UUID
    - **Validates: Requirements 2.8, 3.9, 11.8, 12.4, 13.7, 15.5, 19.1-19.5, 23.1-23.5**

- [ ] 5. Provisioning Queue Service

  - [ ] 5.1 Implement provisioning queue state machine and service
    - Create `src/lib/provisioning/queue.ts` implementing `ProvisioningQueueService`
    - Implement `VALID_TRANSITIONS` map enforcing: payment_pending → payment_verified → pending_provisioning → provisioning_in_progress → provisioned → active
    - Implement `ingest()` with order_id unique constraint (idempotent)
    - Implement `transition()` with state validation
    - Implement `query()` with pagination (25 per page) sorted by `payment_verified_at` ASC
    - Implement `getPipelineCounts()` and `getStaleEntries()` (>24h)
    - Validate required fields on ingest, reject if any missing
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 2.1, 2.2, 2.7, 2.8, 22.1, 22.3, 22.4_

  - [ ]* 5.2 Write property test for provisioning state machine (Property 1)
    - **Property 1: Provisioning State Machine Enforcement**
    - Generate random (currentState, targetState) pairs
    - Verify invalid transitions are rejected and state is unchanged
    - **Validates: Requirements 2.7, 10.5, 22.4**

  - [ ]* 5.3 Write property test for order ingestion idempotency (Property 2)
    - **Property 2: Order Ingestion Idempotency**
    - Generate valid orders, ingest N times, verify exactly one entry exists
    - **Validates: Requirements 1.1, 1.7**

  - [ ]* 5.4 Write property test for queue sort order (Property 21)
    - **Property 21: Provisioning Queue Sort Order**
    - Generate queue entries with random `payment_verified_at` timestamps
    - Verify returned entries are sorted ASC and pages have max 25 entries
    - **Validates: Requirements 1.3**

- [ ] 6. Challenge Rules Service

  - [ ] 6.1 Implement challenge rules service with versioning
    - Create `src/lib/challenges/rules.ts` implementing `ChallengeRulesService`
    - Implement `getActiveRule()` — returns highest-version non-deactivated rule for type+size
    - Implement `create()` — auto-increment version, store new rule
    - Implement `deactivate()` — mark rule version as inactive
    - Implement `listGrouped()` — return all rules grouped by challenge_type
    - Implement `validate()` — enforce all range constraints from Zod schema
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 6.2 Write property test for rule derivation (Property 4)
    - **Property 4: Challenge Parameter Derivation from Highest-Version Rule**
    - Generate multiple rule versions for same type+size
    - Verify `getActiveRule()` returns the highest version that is not deactivated
    - **Validates: Requirements 3.3, 3.7, 4.4**

  - [ ]* 6.3 Write property test for rule versioning immutability (Property 18)
    - **Property 18: Challenge Rule Versioning Immutability**
    - Create rules, modify, verify previous versions unchanged and new version = prev + 1
    - **Validates: Requirements 4.3**

- [ ] 7. Challenge Engine

  - [ ] 7.1 Implement challenge engine with state transitions and batch ops
    - Create `src/lib/challenges/engine.ts` implementing `ChallengeEngine`
    - Implement `create()` — derive params from active rules, generate unique account_number, set initial state
    - Implement `transition()` — validate state machine, enforce min_trading_days on pass, handle override logic
    - Implement `batchTransition()` — process up to 50 accounts, return per-item success/failure
    - Implement `pause()` — freeze trading_days_completed, set status `paused`
    - Implement `resume()` — unfreeze counter, set status `active`
    - Implement `generateAccountNumber()` — ensure uniqueness
    - _Requirements: 2.2, 3.1, 3.3, 3.6, 3.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 7.2 Write property test for challenge pause/resume round trip (Property 8)
    - **Property 8: Challenge Pause/Resume Round Trip**
    - Generate challenges with random trading_days_completed values
    - Pause then resume, verify status is `active` and trading_days_completed unchanged
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 7.3 Write property test for batch operation partial failure (Property 16)
    - **Property 16: Batch Operation Partial Failure Handling**
    - Generate batches with random mix of valid/invalid challenge IDs
    - Verify valid items succeed, invalid items fail independently
    - **Validates: Requirements 5.4, 5.5**

  - [ ]* 7.4 Write property test for account number uniqueness (Property 17)
    - **Property 17: Account Number Uniqueness**
    - Generate N account numbers, verify all are distinct
    - **Validates: Requirements 3.6**

  - [ ]* 7.5 Write property test for override justification (Property 20)
    - **Property 20: Override Requires Minimum Justification**
    - Generate pass actions with random justification lengths (0-50 chars)
    - Verify actions with <20 chars or missing override flag are rejected
    - **Validates: Requirements 5.7, 10.4, 11.2**

- [ ] 8. Funded Account Engine

  - [ ] 8.1 Implement funded account engine
    - Create `src/lib/funded/engine.ts` implementing `FundedAccountEngine`
    - Implement `create()` — validate challenge is `passed`, no existing funded account for it, derive rules from funded_account_rules
    - Implement `createWithScaling()` — apply multiplier (0.5-4.0) to initial_balance
    - Implement `suspend()`, `close()`, `breach()` — state transitions + terminal deactivation
    - Link funded account to original challenge_account_id
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [ ]* 8.2 Write property test for funded account size derivation (Property 9)
    - **Property 9: Funded Account Size Derivation**
    - Generate random initial_balance and multiplier (0.5-4.0)
    - Verify funded account_size = initial_balance × multiplier
    - **Validates: Requirements 6.3, 6.4**

  - [ ]* 8.3 Write property test for funded account eligibility gate (Property 14)
    - **Property 14: Funded Account Eligibility Gate**
    - Generate challenge accounts with random statuses (not `passed`)
    - Verify creation is rejected for non-passed challenges and duplicates
    - **Validates: Requirements 6.7, 6.8**

  - [ ]* 8.4 Write property test for KYC verification gate (Property 15)
    - **Property 15: KYC Verification Gate for Funded Activation**
    - Generate traders with random kyc_status values
    - Verify funded activation is prevented when kyc_status != 'verified'
    - **Validates: Requirements 14.3**

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Payment Engine

  - [ ] 10.1 Implement payment engine with verification and flagging
    - Create `src/lib/payments/engine.ts` implementing `PaymentEngine`
    - Implement `storePayment()` — validate amount (0.01-999999.99), currency (ISO 4217), reference (max 255 chars)
    - Implement `verify()` — transition payment_pending → payment_verified, record verifier
    - Implement `flag()` — set payment_flag (amount_mismatch, duplicate_reference, gateway_failure)
    - Implement `override()` — require 20-char reason, record audit
    - Implement `refund()` — transition to `refunded`, block further transitions
    - Implement `detectDiscrepancies()` — check amount mismatch, duplicate ref, gateway failure
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 10.2 Write property test for payment discrepancy detection (Property 22)
    - **Property 22: Payment Discrepancy Detection**
    - Generate orders with random amount mismatches, duplicate refs, and gateway failures
    - Verify each discrepancy is flagged with correct type and queue entry blocked
    - **Validates: Requirements 10.3**

- [ ] 11. Risk Engine

  - [ ] 11.1 Implement risk engine with alert state machine and breach detection
    - Create `src/lib/risk/engine.ts` implementing `RiskEngine`
    - Implement alert state machine: open → [acknowledged, escalated]; acknowledged → [resolved, escalated]; escalated → [resolved]
    - Implement `acknowledge()`, `resolve()`, `escalate()`, `suspendAccount()`
    - Require `risk.critical` permission for critical alert resolution
    - Implement `checkBreaches()` — detect daily/max drawdown breaches
    - Implement `createBreachAlert()` — auto-create alerts with correct severity
    - Notify staff with `risk.manage` permission on escalation within 30s
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 11.2 Write property test for risk alert state machine (Property 13)
    - **Property 13: Risk Alert State Machine**
    - Generate random (alertStatus, action) pairs
    - Verify invalid transitions are rejected and status unchanged
    - **Validates: Requirements 11.6, 11.7**

  - [ ]* 11.3 Write property test for breach detection threshold (Property 10)
    - **Property 10: Breach Detection Threshold**
    - Generate accounts with random drawdown values around thresholds
    - Verify alerts created with correct severity (high for daily, critical for max)
    - **Validates: Requirements 12.1, 12.2**

- [ ] 12. User Operations Service

  - [ ] 12.1 Implement user operations service (suspend, ban, KYC)
    - Create `src/lib/users/operations.ts` implementing `UserOperationsService`
    - Implement `suspend()` — set account_status `suspended`, cascade to challenge (archived) and funded (suspended) accounts, deactivate terminal
    - Implement `ban()` — set account_status `banned`, cascade to challenge (archived) and funded (closed) accounts
    - Implement `activate()` — set account_status `active`, return list of restorable funded accounts
    - Enforce: cannot suspend already suspended/banned; cannot reactivate banned users
    - Implement `approveKyc()`, `rejectKyc()` — update kyc_status, notify trader on rejection
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 12.2 Write property test for user suspension/ban cascade (Property 11)
    - **Property 11: User Suspension/Ban Cascade**
    - Generate users with random numbers of challenge and funded accounts
    - Suspend: verify all challenges → archived, funded → suspended
    - Ban: verify all challenges → archived, funded → closed
    - **Validates: Requirements 13.2, 13.3**

  - [ ]* 12.3 Write property test for user status transition enforcement (Property 12)
    - **Property 12: User Status Transition Enforcement**
    - Generate users with random current statuses
    - Verify suspend rejected for already-suspended/banned, reactivate rejected for banned
    - **Validates: Requirements 13.8, 13.9**

- [ ] 13. Terminal Integration Service

  - [ ] 13.1 Implement terminal integration service with platform adapters
    - Create `src/lib/terminal/service.ts` implementing `TerminalIntegrationService`
    - Create `src/lib/terminal/adapters/` with base `TerminalPlatformAdapter` interface
    - Implement adapter factory pattern supporting MT4, MT5, cTrader
    - Implement `provisionWithRetry()` — max 3 retries, 30s timeout per attempt
    - Implement `activate()`, `deactivate()`, `regenerateCredentials()`
    - Store platform_account_id, server_name, login_id in terminal_accounts table
    - Store encrypted credentials with credential_status tracking
    - Connection parameters loaded from DB (changeable without code deploy)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 13.2 Write property test for terminal provisioning retry limit (Property 23)
    - **Property 23: Terminal Provisioning Retry Limit**
    - Generate provisioning attempts that fail, verify max 3 retries allowed
    - Verify account remains `provisioning_in_progress` after exhausting retries
    - **Validates: Requirements 7.3**

- [ ] 14. Revenue Service

  - [ ] 14.1 Implement revenue service with real data queries
    - Create `src/lib/revenue/service.ts` implementing `RevenueService`
    - Implement `getRevenue()` — query actual orders grouped by day/week/month
    - Implement `getBreakdown()` — group by challenge_type and account_size
    - Implement `getNetRevenue()` — gross - refunds - payouts
    - Replace placeholder values on executive dashboard with real data
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

  - [ ]* 14.2 Write property test for net revenue calculation (Property 19)
    - **Property 19: Net Revenue Calculation**
    - Generate random orders, refunds, and payouts for a date range
    - Verify net_revenue = sum(orders) - sum(refunds) - sum(payouts)
    - **Validates: Requirements 21.3**

- [ ] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. API Routes — Provisioning and Challenges

  - [ ] 16.1 Create provisioning queue API endpoints
    - Create `src/app/api/provisioning/queue/route.ts` — GET (list queue, paginated)
    - Create `src/app/api/provisioning/queue/[id]/transition/route.ts` — POST (state transitions)
    - Create `src/app/api/provisioning/queue/ingest/route.ts` — POST (webhook from website)
    - Use `withAuth()` wrapper, require `challenges.view` for GET, `challenges.manage` for transitions
    - Return validation errors with field-specific messages
    - _Requirements: 1.1, 1.3, 1.4, 1.6, 1.7, 2.1, 2.7, 2.8, 22.1, 22.3_

  - [ ] 16.2 Refactor challenge account API with auth and provisioning integration
    - Update `src/app/api/challenges/[id]/[action]/route.ts` — use `withAuth()`, replace hardcoded actor_id with session identity
    - Create `src/app/api/challenges/route.ts` — POST for challenge creation via provisioning
    - Create `src/app/api/challenges/batch/route.ts` — POST for batch operations (max 50)
    - Create `src/app/api/challenges/rules/route.ts` — GET/POST for challenge rules CRUD
    - Enforce `challenges.create`, `challenges.manage`, `challenges.override`, `settings.manage` permissions
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.8, 3.9, 5.1, 5.4, 5.6, 5.7, 5.8, 15.1_

  - [ ]* 16.3 Write unit tests for provisioning and challenge API routes
    - Test happy path for queue ingestion, state transitions, challenge creation
    - Test error cases: missing fields, invalid transitions, permission denied
    - Test batch operations with mixed valid/invalid items
    - _Requirements: 1.6, 2.7, 3.2, 3.4, 3.5, 5.5_

- [ ] 17. API Routes — Funded Accounts and Payments

  - [ ] 17.1 Create funded account API endpoints
    - Create `src/app/api/funded/route.ts` — POST for funded account creation
    - Create `src/app/api/funded/[id]/[action]/route.ts` — POST for suspend, close, breach actions
    - Validate challenge is `passed`, no duplicate funded account, KYC verified for activation
    - Use `withAuth()`, require `funded.create` and `funded.manage` permissions
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [ ] 17.2 Create payment API endpoints
    - Create `src/app/api/payments/[id]/verify/route.ts` — POST (require `payments.verify`)
    - Create `src/app/api/payments/[id]/override/route.ts` — POST (require `payments.override`, min 20 chars)
    - Wire to PaymentEngine for verification, flagging, and override
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ] 17.3 Refactor payout API routes with session identity
    - Update existing payout action routes to use `withAuth()` wrapper
    - Replace hardcoded placeholder actor_id with authenticated session staff ID
    - Enforce `payouts.approve` for approval, `payouts.manage` for reject/retry
    - Validate funded account `payout_eligible` and trader `kyc_status` on approval
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 18. API Routes — Users, KYC, Risk, and System

  - [ ] 18.1 Create user operation API endpoints
    - Create `src/app/api/users/[id]/suspend/route.ts` — POST (require `users.suspend`)
    - Create `src/app/api/users/[id]/ban/route.ts` — POST (require `users.suspend`)
    - Create `src/app/api/users/[id]/activate/route.ts` — POST (require `users.suspend`)
    - Validate reason length (10-1000 chars), current status transitions
    - Return error for already-suspended/banned users or reactivating banned users
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_

  - [ ] 18.2 Create KYC API endpoints
    - Create `src/app/api/kyc/[id]/approve/route.ts` — POST (require `kyc.manage`)
    - Create `src/app/api/kyc/[id]/reject/route.ts` — POST (require `kyc.manage`)
    - Update user kyc_status, record reviewer, notify trader on rejection
    - _Requirements: 14.1, 14.2, 14.4, 14.5_

  - [ ] 18.3 Create risk alert API endpoints
    - Create `src/app/api/risk/[id]/[action]/route.ts` — POST for acknowledge, resolve, escalate, suspend-account
    - Enforce `risk.manage` permission, `risk.critical` for critical alerts
    - Validate alert state transitions, require resolution_outcome and action_taken for resolve
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [ ] 18.4 Create terminal provisioning and credential API endpoints
    - Create `src/app/api/terminal/provision/route.ts` — POST (require `challenges.manage`)
    - Create `src/app/api/terminal/credentials/[id]/route.ts` — POST for deliver, regenerate
    - Implement retry logic (max 3 attempts), 30s timeout
    - Store terminal credentials, manage credential_status lifecycle
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 18.5 Create system configuration and founder API endpoints
    - Create `src/app/api/config/flags/route.ts` — GET/POST for feature flags (require `settings.manage` for POST)
    - Create `src/app/api/staff/route.ts` — POST for staff creation (require `staff.create`)
    - Create `src/app/api/founder/emergency/[action]/route.ts` — POST for maintenance mode, emergency freeze (Founder only)
    - Create `src/app/api/founder/search/route.ts` — GET for global search (Founder only, min 1 char)
    - Create `src/app/api/executive/revenue/route.ts` — GET for revenue metrics (require `revenue.view`)
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 17.1, 17.2, 17.3, 17.4, 17.5, 21.5_

- [ ] 19. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. UI — Provisioning Queue and Pipeline Dashboard

  - [ ] 20.1 Build provisioning queue page
    - Update `src/app/(dashboard)/orders/page.tsx` or create new provisioning page
    - Display queue entries with: trader email, name, country, KYC status, challenge type, account size, time elapsed (relative format e.g. "3h 24m")
    - Filter by status (`payment_verified`, `pending_provisioning`), sort by payment_verified_at ASC
    - Paginate with 25 entries per page
    - Add action buttons for approve, initiate creation, activate transitions
    - Highlight entries stale >24h
    - _Requirements: 1.3, 1.4, 24.1, 24.4, 24.5_

  - [ ] 20.2 Build provisioning pipeline dashboard and workflow timeline
    - Display pipeline stage counts (card per status)
    - Show average time per stage for operational monitoring
    - Build workflow timeline view for individual entries (payment → activation)
    - Display rejected/cancelled entries in separate archive view
    - _Requirements: 24.1, 24.2, 24.3, 24.5, 22.5_

- [ ] 21. UI — Challenge Rules Settings and Funded Promotion

  - [ ] 21.1 Build challenge rules configuration page
    - Create/update `src/app/(dashboard)/settings/page.tsx` with challenge rules section at `/settings/challenge-rules`
    - List rules grouped by challenge_type
    - Form for creating new rules with all field validations
    - Display version history for each rule
    - Hide create/edit controls for staff without `settings.manage` permission (read-only view)
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7_

  - [ ] 21.2 Build funded account promotion UI
    - Update `src/app/(dashboard)/funded/page.tsx` for funded account provisioning queue
    - Show passed challenges eligible for funded promotion
    - Form with optional scaling multiplier (0.5-4.0, default 1.0)
    - Display profit_split_pct, drawdown limits from funded account rules
    - KYC verification status check before allowing activation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 14.3_

- [ ] 22. UI — KYC, Risk, Staff, and Founder Pages

  - [ ] 22.1 Build KYC review page
    - Update `src/app/(dashboard)/kyc/page.tsx`
    - Display KYC document images, submission date, verification history
    - Approve/reject buttons with reason field on rejection
    - Permission-gate: hide actions without `kyc.manage`
    - _Requirements: 14.1, 14.2, 14.4, 14.5, 14.6_

  - [ ] 22.2 Build risk alert actions UI
    - Update `src/app/(dashboard)/risk/page.tsx`
    - Display alerts with acknowledge, resolve, escalate, suspend-account actions
    - Show confirmation prompt for suspend-account (display account identifier and trader name)
    - Resolution form with outcome selection and action_taken text (20-2000 chars)
    - Permission-gate actions by `risk.manage` and `risk.critical`
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6_

  - [ ] 22.3 Build staff creation and management page
    - Update `src/app/(dashboard)/staff/page.tsx`
    - Staff creation form: email, name, role assignment
    - Show/hide create button based on `staff.create` permission
    - Disable staff action with session invalidation
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [ ] 22.4 Build founder emergency controls page
    - Update `src/app/(dashboard)/founder/emergency/page.tsx`
    - Maintenance mode toggle with confirmation prompt
    - Emergency account freeze with confirmation (show affected count)
    - Global search input (min 1 char, max 50 results across users/challenges/funded/orders/trades)
    - Impersonation UI (read-only view of another staff member's perspective)
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [ ] 23. UI — Executive Dashboard and System Health

  - [ ] 23.1 Build real revenue metrics on executive dashboard
    - Update `src/app/(dashboard)/executive/page.tsx`
    - Replace placeholder values with real data from Revenue Service
    - Show total revenue, net revenue (gross - refunds - payouts)
    - Revenue breakdown by challenge_type and account_size
    - Date range selector with day/week/month grouping
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

  - [ ] 23.2 Build feature flag management and system health UI
    - Update `src/app/(dashboard)/founder/flags/page.tsx` for feature flag CRUD
    - Display flag name, description, enabled state, scope
    - Update `src/app/(dashboard)/monitoring/page.tsx` for live system health
    - Show database connection status, API response times, active sessions, queue depth (refresh ≤30s)
    - _Requirements: 16.5, 16.6_

  - [ ] 23.3 Add audit history view to account detail pages
    - Update challenge detail page `src/app/(dashboard)/challenges/[challengeId]/page.tsx`
    - Update funded account detail page `src/app/(dashboard)/funded/[accountId]/page.tsx`
    - Display complete chronological audit trail and challenge timeline
    - Show terminal activation status alongside account details
    - _Requirements: 23.5, 9.5, 24.2_

- [ ] 24. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 25. Integration wiring and database migrations

  - [ ] 25.1 Create Supabase database migration for new tables
    - Write SQL migration creating: `provisioning_queue`, `challenge_rules`, `funded_account_rules`, `terminal_accounts`, `feature_flags`, `kyc_submissions`, `challenge_timeline`
    - Add columns to existing tables: `challenge_accounts`, `funded_accounts`, `users`
    - Add unique constraints: `provisioning_queue.order_id`, `(challenge_type, account_size, version)` on challenge_rules
    - Add foreign keys and indexes for query performance
    - Insert new permissions into `role_permissions` table
    - _Requirements: 1.2, 2.2, 4.2, 7.2, 7.5, 16.5_

  - [ ] 25.2 Wire Supabase Realtime subscription for order ingestion
    - Set up Realtime listener on `orders` table (or webhook endpoint) in provisioning queue service
    - On new order insert from website, automatically call `ingest()` to create queue entry
    - Ensure ingestion completes within 30 seconds of payment verification
    - Handle connection drops with automatic reconnection
    - _Requirements: 1.1, 1.5_

  - [ ] 25.3 Wire terminal account synchronization with account status
    - Implement auto-deactivation of terminal account when challenge/funded account is suspended/breached
    - Connect user suspension cascade to terminal deactivation for all user's accounts
    - Synchronize terminal activation status display in UI
    - _Requirements: 9.3, 9.4, 12.3, 12.5, 13.2_

  - [ ] 25.4 Wire notification system for credential delivery and alerts
    - Implement email notification for terminal credential delivery (server_name, login_id, platform_type, one-time password)
    - Implement in-app notification for risk alert escalation (within 30s to all staff with `risk.manage`)
    - Implement trader notification for KYC rejection and order rejection
    - Implement onboarding email for new staff creation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 11.3, 14.2, 17.3, 22.2_

  - [ ]* 25.5 Write integration tests for end-to-end provisioning flow
    - Test full pipeline: order → queue → challenge → terminal → active
    - Test funded promotion: passed challenge → funded account → terminal
    - Test breach detection → alert → suspension flow
    - Test credential delivery flow
    - _Requirements: 1.1, 2.1-2.8, 7.1-7.5, 8.1-8.5_

- [ ] 26. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 24 universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Implementation order respects dependencies: types → security → engines → APIs → UI → wiring
- The existing RBAC engine (`src/lib/rbac/engine.ts`) and session infrastructure are reused — not rebuilt
- All hardcoded `actor_id` placeholders in existing code must be replaced with authenticated session identity
- The `withAuth()` wrapper pattern ensures consistent auth + RBAC across all new API routes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "2.1", "2.3"] },
    { "id": 2, "tasks": ["1.5", "2.2", "2.4"] },
    { "id": 3, "tasks": ["2.5", "2.6", "4.1"] },
    { "id": 4, "tasks": ["4.2", "5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "6.2", "6.3", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4", "7.5", "8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "8.4", "10.1", "11.1"] },
    { "id": 8, "tasks": ["10.2", "11.2", "11.3", "12.1", "13.1"] },
    { "id": 9, "tasks": ["12.2", "12.3", "13.2", "14.1"] },
    { "id": 10, "tasks": ["14.2", "16.1", "16.2"] },
    { "id": 11, "tasks": ["16.3", "17.1", "17.2", "17.3"] },
    { "id": 12, "tasks": ["18.1", "18.2", "18.3", "18.4", "18.5"] },
    { "id": 13, "tasks": ["20.1", "20.2", "21.1", "21.2"] },
    { "id": 14, "tasks": ["22.1", "22.2", "22.3", "22.4"] },
    { "id": 15, "tasks": ["23.1", "23.2", "23.3"] },
    { "id": 16, "tasks": ["25.1"] },
    { "id": 17, "tasks": ["25.2", "25.3", "25.4"] },
    { "id": 18, "tasks": ["25.5"] }
  ]
}
```
