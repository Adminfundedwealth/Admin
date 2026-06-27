# Requirements Document

## Introduction

This document defines the requirements for transforming the FundedWealth Admin Panel (admin.fundedwealth.com) from a read-only monitoring dashboard into the single operational control center for the prop trading firm. The Admin Panel becomes the exclusive account provisioning authority — no trading account is created directly by fundedwealth.com. All paid users enter a provisioning queue and are processed through Admin before terminal activation. The system shares a single Supabase project across Website, Admin, and Terminal, using `users.id` (UUID) as the canonical identity.

## Glossary

- **Admin_Panel**: The administrative web application at admin.fundedwealth.com built with Next.js 14.2, serving as the single operational control center for FundedWealth
- **Provisioning_Queue**: An ordered list of paid users awaiting account creation, sorted by payment verification timestamp
- **Staff_Member**: An authenticated admin panel user with assigned roles and permissions, identified by a record in the staff_members table
- **Trader**: A customer who has paid for a challenge on fundedwealth.com, identified by `users.id` (UUID)
- **Challenge_Account**: A trading account with specific rules (profit target, drawdown limits, trading days) used to evaluate a Trader before granting funded status
- **Funded_Account**: A live trading account granted to a Trader who has passed a Challenge, with profit-split and risk parameters
- **Terminal**: The trading platform (MT4/MT5/cTrader) where Traders execute trades on their provisioned accounts
- **RBAC_Engine**: The Role-Based Access Control system that enforces granular permissions across the Admin Panel, with Founder/Co-Founder bypass
- **Session_Manager**: The component that creates, validates, refreshes, and invalidates staff sessions using SHA-256 hashed tokens stored in the staff_sessions table
- **Audit_Record**: An append-only log entry capturing actor, action, target, previous state, new state, IP address, and device info for every mutation
- **Risk_Alert**: A system-generated notification when a trading account approaches or breaches configured risk thresholds
- **Provisioning_Status**: The lifecycle state of an order: `payment_pending` → `payment_verified` → `pending_provisioning` → `provisioning_in_progress` → `provisioned` → `active`
- **Challenge_Rules**: Configurable parameters defining challenge behavior including profit targets, drawdown limits, minimum/maximum trading days, and prohibited strategies
- **KYC_Submission**: A Know Your Customer verification document submitted by a Trader for identity validation
- **Feature_Flag**: A named boolean toggle that controls availability of system features without code deployment
- **Service_Role_Client**: The Supabase client using the service role key that bypasses Row Level Security for server-side operations

## Requirements

### Requirement 1: Provisioning Queue Ingestion

**User Story:** As a staff member, I want orders from fundedwealth.com to automatically appear in a provisioning queue, so that I can process paid users into trading accounts.

#### Acceptance Criteria

1. WHEN a payment is verified on fundedwealth.com, THE Admin_Panel SHALL create a provisioning queue entry with Provisioning_Status set to `payment_verified` within 30 seconds, using the order_id as a unique constraint to prevent duplicate entries
2. THE Admin_Panel SHALL store each provisioning queue entry with: order_id, user_id, challenge_type, account_size, payment_amount, payment_method, payment_reference, payment_verified_at, and Provisioning_Status
3. THE Admin_Panel SHALL display the provisioning queue showing entries with Provisioning_Status of `payment_verified` or `pending_provisioning`, sorted by payment_verified_at in ascending order (oldest first), paginated in groups of 25 entries per page
4. WHEN a Staff_Member views the provisioning queue, THE Admin_Panel SHALL show Trader email, name, country, KYC status, challenge type, account size, and time elapsed since payment displayed in human-readable relative format (e.g., "3h 24m" or "2d 5h")
5. THE Admin_Panel SHALL prevent creation of any Challenge_Account or Funded_Account outside of the provisioning workflow
6. IF an incoming order from fundedwealth.com is missing any required field (order_id, user_id, challenge_type, account_size, payment_amount, payment_method, payment_reference, or payment_verified_at), THEN THE Admin_Panel SHALL reject the entry, log the validation failure with the missing fields, and not create a provisioning queue entry
7. IF a provisioning queue entry is received with an order_id that already exists, THEN THE Admin_Panel SHALL discard the duplicate and log the duplicate receipt without altering the existing entry

### Requirement 2: Account Provisioning Workflow

**User Story:** As a staff member, I want to provision challenge accounts for paid traders through a structured workflow, so that every account is reviewed before activation.

#### Acceptance Criteria

1. WHEN a Staff_Member approves a provisioning queue entry with Provisioning_Status `payment_verified`, THE Admin_Panel SHALL transition the Provisioning_Status to `pending_provisioning`
2. WHEN a Staff_Member initiates account creation on a `pending_provisioning` entry, THE Admin_Panel SHALL transition the Provisioning_Status to `provisioning_in_progress` and create a Challenge_Account record with account_number, challenge_type, initial_balance, profit_target_pct, daily_drawdown_limit_pct, max_drawdown_limit_pct, min_trading_days, and max_trading_days derived from the active Challenge_Rules configuration
3. WHEN a Challenge_Account is created, THE Admin_Panel SHALL assign the account to the Trader using `users.id` as the foreign key
4. WHEN the Challenge_Account record is persisted and the terminal account creation is confirmed, THE Admin_Panel SHALL transition the Provisioning_Status to `provisioned`
5. WHEN a Staff_Member activates a provisioned account, THE Admin_Panel SHALL transition the Provisioning_Status to `active` and set the Challenge_Account status to `active`
6. IF account provisioning fails at any step, THEN THE Admin_Panel SHALL retain the Provisioning_Status as `provisioning_in_progress`, log the failure reason, display an error message indicating the failure cause and a retry option to the Staff_Member
7. IF a Staff_Member attempts a provisioning state transition that does not follow the sequence `payment_verified` → `pending_provisioning` → `provisioning_in_progress` → `provisioned` → `active`, THEN THE Admin_Panel SHALL reject the action and display an error message indicating the invalid transition
8. THE Admin_Panel SHALL record an Audit_Record for each provisioning state transition including actor_id, previous_state, new_state, and timestamp

### Requirement 3: Challenge Account Creation API

**User Story:** As a staff member, I want an API endpoint to create challenge accounts, so that provisioning can be executed programmatically with proper validation.

#### Acceptance Criteria

1. WHEN a POST request is sent to `/api/challenges` with valid parameters, THE Admin_Panel SHALL create a new Challenge_Account record and return the created account data including id, account_number, user_id, challenge_type, status, initial_balance, current_balance, profit_target_pct, daily_drawdown_limit_pct, max_drawdown_limit_pct, min_trading_days, max_trading_days, and started_at with HTTP 201
2. THE Admin_Panel SHALL validate that the request body includes user_id (valid UUID), challenge_type (non-empty string), and account_size (numeric value greater than zero), and IF any required field is missing or invalid, THEN THE Admin_Panel SHALL return HTTP 400 with an error message indicating which fields failed validation
3. THE Admin_Panel SHALL derive challenge parameters (profit_target_pct, daily_drawdown_limit_pct, max_drawdown_limit_pct, min_trading_days, max_trading_days) from the active Challenge_Rules for the specified challenge_type and account_size, and SHALL set initial_balance equal to the account_size value
4. IF the specified user_id does not exist in the users table, THEN THE Admin_Panel SHALL return HTTP 404 with error code `USER_NOT_FOUND`
5. IF the Staff_Member lacks the `challenges.create` permission, THEN THE Admin_Panel SHALL return HTTP 403 with error code `FORBIDDEN`
6. THE Admin_Panel SHALL generate a unique account_number for each created Challenge_Account
7. WHEN a Challenge_Account is created, THE Admin_Panel SHALL set started_at to the current timestamp, status to `active`, current_balance to the initial_balance, trading_days_completed to 0, profit_pct to 0, max_daily_drawdown_pct to 0, and max_drawdown_pct to 0
8. IF no active Challenge_Rules exist for the specified challenge_type and account_size combination, THEN THE Admin_Panel SHALL return HTTP 422 with an error message indicating no matching rules were found
9. THE Admin_Panel SHALL record an Audit_Record with action `challenge.create` including the actor_id from the authenticated session and the full account parameters in new_state

### Requirement 4: Challenge Rules Configuration

**User Story:** As a staff member, I want to configure challenge rules without code deployment, so that business parameters can be adjusted operationally.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide a `/settings/challenge-rules` page listing all challenge rule configurations grouped by challenge_type
2. WHEN a Staff_Member creates a challenge rule, THE Admin_Panel SHALL store: challenge_type, account_size (between 1,000 and 10,000,000), profit_target_pct, daily_drawdown_limit_pct, max_drawdown_limit_pct, min_trading_days (between 1 and 365), max_trading_days (between 1 and 365), and prohibited_strategies (maximum 20 entries, each up to 100 characters)
3. WHEN a Staff_Member modifies a challenge rule, THE Admin_Panel SHALL create a new version of the rule with an incremented version number and retain all previous versions indefinitely
4. THE Admin_Panel SHALL use the highest-version rule matching the specified challenge_type and account_size that has not been marked as deactivated when provisioning new Challenge_Accounts
5. IF a Staff_Member lacks the `settings.manage` permission, THEN THE Admin_Panel SHALL hide the create and edit controls on the `/settings/challenge-rules` page, display the rules in read-only mode, and return HTTP 403 if the Staff_Member attempts rule modification via the API
6. THE Admin_Panel SHALL validate that profit_target_pct is between 1 and 100, daily_drawdown_limit_pct is between 1 and 50, max_drawdown_limit_pct is between 1 and 100, min_trading_days is between 1 and 365, max_trading_days is between 1 and 365, max_trading_days is greater than or equal to min_trading_days, and account_size is between 1,000 and 10,000,000
7. IF a challenge rule submission fails validation, THEN THE Admin_Panel SHALL reject the submission, preserve the existing rule unchanged, and display an error message indicating which field failed validation and the acceptable range
8. IF no active rule exists for the specified challenge_type and account_size combination during provisioning, THEN THE Admin_Panel SHALL block the provisioning attempt and display an error message indicating that no matching challenge rule configuration is available

### Requirement 5: Challenge Management Extensions

**User Story:** As a staff member, I want to create, assign, and manage challenges through their full lifecycle, so that I can handle all operational scenarios.

#### Acceptance Criteria

1. WHEN a Staff_Member creates a challenge via the provisioning workflow, THE Admin_Panel SHALL record a `challenge.create` entry in the challenge_timeline table containing actor_id, challenge_account_id, action, and timestamp
2. WHEN a Staff_Member pauses an active Challenge_Account, THE Admin_Panel SHALL set the status to `paused`, freeze the trading_days_completed counter at its current value, and record a `challenge.pause` entry in the challenge_timeline table with actor_id and timestamp
3. WHEN a Staff_Member resumes a paused Challenge_Account, THE Admin_Panel SHALL set the status back to `active`, allow subsequent trading days to increment the trading_days_completed counter from its frozen value, and record a `challenge.resume` entry in the challenge_timeline table with actor_id and timestamp
4. THE Admin_Panel SHALL support batch operations for pass, fail, and archive actions on up to 50 Challenge_Accounts in a single request
5. IF one or more accounts in a batch operation fail validation or encounter an error, THEN THE Admin_Panel SHALL process all valid accounts, skip the failing accounts, and return a response listing each account with its individual success or failure outcome and reason
6. WHEN a Challenge_Account is passed, THE Admin_Panel SHALL validate that trading_days_completed is greater than or equal to min_trading_days before allowing the transition to `passed` status
7. IF min_trading_days has not been met during a pass action and the Staff_Member holds the `challenges.override` permission, THEN THE Admin_Panel SHALL require an override flag set to true in the request along with a written justification of at least 20 characters before executing the pass action
8. IF min_trading_days has not been met during a pass action and the Staff_Member lacks the `challenges.override` permission, THEN THE Admin_Panel SHALL reject the pass action and return an error indicating that the minimum trading days requirement has not been met

### Requirement 6: Funded Account Provisioning

**User Story:** As a staff member, I want to create funded accounts for traders who have passed their challenge, so that successful traders can begin live trading.

#### Acceptance Criteria

1. WHEN a Challenge_Account status transitions to `passed`, THE Admin_Panel SHALL add the Trader to a funded account provisioning queue
2. WHEN a Staff_Member approves funded account creation, THE Admin_Panel SHALL create a Funded_Account record linked to the original Challenge_Account via challenge_account_id
3. WHEN a Staff_Member approves funded account creation without specifying a scaling adjustment, THE Admin_Panel SHALL set the Funded_Account account_size equal to the Challenge_Account initial_balance
4. IF a Staff_Member specifies a scaling adjustment during funded account creation, THEN THE Admin_Panel SHALL apply the adjustment as a multiplier between 0.5 and 4.0 (inclusive) to the Challenge_Account initial_balance to determine the Funded_Account account_size
5. WHEN a Funded_Account is created, THE Admin_Panel SHALL assign profit_split_pct, daily_drawdown_limit_pct, and max_drawdown_limit_pct from the funded account rules configuration matching the account_size tier
6. IF a POST request is sent to `/api/funded` with valid parameters (challenge_account_id is required), THEN THE Admin_Panel SHALL create the Funded_Account record and return HTTP 201
7. IF the referenced challenge_account_id does not exist or its status is not `passed`, THEN THE Admin_Panel SHALL return HTTP 400 with an error message indicating the challenge account is not eligible for funded promotion
8. IF a Funded_Account already exists for the specified challenge_account_id, THEN THE Admin_Panel SHALL return HTTP 409 with an error message indicating a duplicate funded account
9. IF the Staff_Member lacks the `funded.create` permission, THEN THE Admin_Panel SHALL return HTTP 403 with error code `FORBIDDEN`
10. WHEN a Funded_Account is created, THE Admin_Panel SHALL record an Audit_Record with action `funded.create` including the challenge_account_id, assigned account_size, and profit_split_pct

### Requirement 7: Terminal Integration — Account Provisioning

**User Story:** As a staff member, I want to provision trading accounts on the terminal platform from the admin panel, so that traders receive their credentials without manual platform login.

#### Acceptance Criteria

1. WHEN a Staff_Member triggers terminal account creation, THE Admin_Panel SHALL send account provisioning parameters to the Terminal platform API including account_type, initial_balance, leverage (between 1 and 500), and trading_group
2. WHEN the Terminal platform confirms account creation, THE Admin_Panel SHALL store the platform_account_id, server_name, and login_id in the corresponding Challenge_Account or Funded_Account record and transition the Provisioning_Status to `provisioned`
3. IF the Terminal platform returns an error or does not respond within 30 seconds, THEN THE Admin_Panel SHALL display the platform error message to the Staff_Member, retain the account in `provisioning_in_progress` status, and allow the Staff_Member to retry provisioning up to 3 additional attempts
4. THE Admin_Panel SHALL support provisioning to MT4, MT5, and cTrader platforms via a platform adapter interface whose connection parameters are changeable without code deployment
5. WHEN terminal credentials are generated, THE Admin_Panel SHALL store the encrypted credentials (login_id, one-time password, and server address) and set the account credential_status to `ready_for_delivery`

### Requirement 8: Terminal Credentials Delivery

**User Story:** As a staff member, I want to deliver terminal credentials to traders securely, so that they can access their trading accounts.

#### Acceptance Criteria

1. WHEN a Staff_Member triggers credential delivery, THE Admin_Panel SHALL send the terminal login credentials to the Trader via email notification
2. THE Admin_Panel SHALL include in the credential delivery: server_name, login_id, platform_type, and a one-time password that the Trader must change on first login
3. WHEN credentials are delivered, THE Admin_Panel SHALL record the delivery timestamp and method in the Audit_Record
4. IF credential delivery fails, THEN THE Admin_Panel SHALL mark the delivery as failed and allow the Staff_Member to retry
5. THE Admin_Panel SHALL provide a credential regeneration action that creates new credentials and invalidates the previous set

### Requirement 9: Terminal SSO and Account Activation

**User Story:** As a staff member, I want to manage terminal account activation states, so that I can control when traders can access the platform.

#### Acceptance Criteria

1. WHEN a Staff_Member activates a terminal account, THE Admin_Panel SHALL send an activation signal to the Terminal platform enabling login for that account
2. WHEN a Staff_Member deactivates a terminal account, THE Admin_Panel SHALL send a deactivation signal to the Terminal platform preventing login for that account
3. THE Admin_Panel SHALL synchronize terminal account status with Challenge_Account and Funded_Account status (suspended account disables terminal access)
4. WHEN a Challenge_Account or Funded_Account is suspended, THE Admin_Panel SHALL automatically deactivate the corresponding terminal account
5. THE Admin_Panel SHALL display the terminal activation status alongside the account details in the admin interface

### Requirement 10: Payment Operations

**User Story:** As a staff member, I want to verify and manage payments before provisioning, so that only legitimate paid orders enter the provisioning workflow.

#### Acceptance Criteria

1. WHEN an order is received from fundedwealth.com, THE Admin_Panel SHALL store the payment details including amount (0.01 to 999,999.99), currency (ISO 4217 3-letter code), payment_method, transaction_reference (max 255 characters), and payment_gateway_response
2. WHEN a Staff_Member with `payments.verify` permission verifies a payment, THE Admin_Panel SHALL transition the order Provisioning_Status from `payment_pending` to `payment_verified` and record the verifying Staff_Member ID and verification timestamp
3. IF payment verification reveals a discrepancy (received amount differs from order amount, transaction_reference matches an existing order, or gateway response indicates failure), THEN THE Admin_Panel SHALL set the order payment_flag to the discrepancy type, prevent automatic queue entry, and display the flagged order in a dedicated review list
4. WHEN a Staff_Member with `payments.override` permission triggers a manual payment override on a flagged or unverifiable order, THE Admin_Panel SHALL transition the Provisioning_Status to `payment_verified`, require an override reason of at least 20 characters, and record an Audit_Record with action `payment.override`
5. WHEN a payment is refunded, THE Admin_Panel SHALL transition the Provisioning_Status to `refunded` and prevent any further provisioning state transitions on the associated order
6. THE Admin_Panel SHALL display payment verification status, transaction_reference, payment_method, amount, currency, gateway response status, and any payment_flag with discrepancy type on the provisioning queue entry

### Requirement 11: Risk Alert Actions

**User Story:** As a staff member, I want to take action on risk alerts, so that I can protect the firm from excessive losses.

#### Acceptance Criteria

1. WHEN a Staff_Member acknowledges a Risk_Alert with status `open`, THE Admin_Panel SHALL transition the alert status to `acknowledged`, record the acknowledging Staff_Member ID and timestamp, and verify the Staff_Member holds `risk.manage` permission before executing the action
2. WHEN a Staff_Member resolves a Risk_Alert with status `acknowledged`, THE Admin_Panel SHALL require a resolution_outcome selected from: account_suspended, rule_adjusted, false_positive, or escalated, and an action_taken description of at least 20 characters and no more than 2000 characters, then transition the alert status to `resolved`
3. WHEN a Staff_Member escalates a Risk_Alert, THE Admin_Panel SHALL transition the alert status to `escalated` and deliver an in-app notification to all Staff_Members with `risk.manage` permission within 30 seconds of the escalation action
4. IF a Risk_Alert has severity `critical`, THEN THE Admin_Panel SHALL require resolution by a Staff_Member with `risk.critical` permission
5. WHEN a daily drawdown breach is confirmed, THE Admin_Panel SHALL provide a one-click action to suspend the associated trading account, requiring the Staff_Member to confirm the suspension via a confirmation prompt displaying the account identifier and trader name before execution, and upon confirmation SHALL transition the trading account status to `suspended` and create an Audit_Record
6. IF a Staff_Member attempts a Risk_Alert action that is not valid for the alert's current status, THEN THE Admin_Panel SHALL reject the action and display an error message indicating the current status and the permitted transitions (open → acknowledged or escalated; acknowledged → resolved or escalated; escalated → resolved)
7. IF a Staff_Member attempts a Risk_Alert action and the action fails due to a system error, THEN THE Admin_Panel SHALL display an error message indicating the failure reason and preserve the alert's previous status unchanged
8. THE Admin_Panel SHALL support the following actions on Risk_Alerts: acknowledge, resolve, escalate, and suspend-account, where each action creates an Audit_Record containing actor, timestamp, action type, target alert identifier, and any associated reason or resolution details

### Requirement 12: Account Breach Handling

**User Story:** As a staff member, I want automated breach detection to trigger account actions, so that risk limits are enforced without manual monitoring.

#### Acceptance Criteria

1. WHEN daily_drawdown_used_pct exceeds daily_drawdown_limit_pct on a Funded_Account, THE Admin_Panel SHALL automatically create a Risk_Alert with severity `high` and breach_type `daily_drawdown`
2. WHEN max_drawdown_used_pct exceeds max_drawdown_limit_pct on a Funded_Account, THE Admin_Panel SHALL automatically create a Risk_Alert with severity `critical` and breach_type `max_drawdown`
3. WHEN a max drawdown breach is confirmed by a Staff_Member, THE Admin_Panel SHALL transition the Funded_Account status to `breached` and deactivate the terminal account
4. THE Admin_Panel SHALL record all automated breach actions in the Audit_Record with actor_role set to `system`
5. WHILE a Funded_Account status is `breached`, THE Admin_Panel SHALL prevent any new trades from being opened on that account via the terminal

### Requirement 13: User Suspend and Ban Operations

**User Story:** As a staff member, I want to suspend and ban users, so that I can enforce platform rules and remove bad actors.

#### Acceptance Criteria

1. WHEN a Staff_Member suspends a Trader, THE Admin_Panel SHALL set the user account_status to `suspended`, record the suspension reason (minimum 10 characters, maximum 1000 characters), and record the suspension timestamp
2. WHEN a Trader is suspended, THE Admin_Panel SHALL set all associated Challenge_Accounts to status `archived` and all associated Funded_Accounts to status `suspended` on the Terminal platform within 10 seconds of the suspension action
3. WHEN a Staff_Member bans a Trader, THE Admin_Panel SHALL set the user account_status to `banned`, record the ban_reason (minimum 10 characters, maximum 1000 characters), set all associated Challenge_Accounts to status `archived`, and set all associated Funded_Accounts to status `closed`
4. WHEN a Staff_Member reactivates a suspended Trader, THE Admin_Panel SHALL set the user account_status to `active` and display a list of the Trader's previously suspended Funded_Accounts with the option to individually restore each account to `active` status
5. IF a Staff_Member lacks the `users.ban` permission, THEN THE Admin_Panel SHALL reject suspend, ban, and reactivate actions and display an error message indicating insufficient permissions
6. THE Admin_Panel SHALL provide API endpoints at `/api/users/[id]/suspend`, `/api/users/[id]/ban`, and `/api/users/[id]/activate`
7. THE Admin_Panel SHALL record an Audit_Record for each user status change with the previous account_status, new account_status, reason provided, and the identifiers of all associated accounts affected by the operation
8. IF a Staff_Member attempts to suspend a Trader whose account_status is already `suspended` or `banned`, THEN THE Admin_Panel SHALL reject the action and display an error message indicating the user's current status and the permitted transitions
9. IF a Staff_Member attempts to reactivate a Trader whose account_status is `banned`, THEN THE Admin_Panel SHALL reject the action and display an error message indicating that banned users cannot be reactivated

### Requirement 14: KYC Operations

**User Story:** As a staff member, I want to approve and reject KYC submissions, so that identity verification is completed before funded account activation.

#### Acceptance Criteria

1. WHEN a Staff_Member approves a KYC_Submission, THE Admin_Panel SHALL set the user kyc_status to `verified` and record the approving Staff_Member ID
2. WHEN a Staff_Member rejects a KYC_Submission, THE Admin_Panel SHALL set the user kyc_status to `rejected`, record the rejection reason, and notify the Trader
3. IF a Trader kyc_status is not `verified`, THEN THE Admin_Panel SHALL prevent funded account activation for that Trader
4. THE Admin_Panel SHALL provide API endpoints at `/api/kyc/[id]/approve` and `/api/kyc/[id]/reject`
5. IF a Staff_Member lacks the `kyc.manage` permission, THEN THE Admin_Panel SHALL return HTTP 403 for KYC approval and rejection actions
6. THE Admin_Panel SHALL display KYC document images, submission date, and verification history on the KYC review page

### Requirement 15: Payout Operations Completion

**User Story:** As a staff member, I want payout operations to use authenticated session identity, so that all payout actions are attributed to the correct staff member.

#### Acceptance Criteria

1. WHEN a payout action (approve, reject, retry) is executed, THE Admin_Panel SHALL extract the Staff_Member ID from the validated session token instead of using a hardcoded placeholder
2. THE Admin_Panel SHALL verify that the Staff_Member has the `payouts.approve` permission before allowing payout approval
3. THE Admin_Panel SHALL verify that the Staff_Member has the `payouts.manage` permission before allowing payout rejection or retry
4. WHEN a payout is approved, THE Admin_Panel SHALL validate that the Funded_Account payout_eligible flag is true and the Trader kyc_status is `verified`
5. THE Admin_Panel SHALL record the authenticated Staff_Member ID in all payout Audit_Records and payout_status_history entries

### Requirement 16: Founder Emergency Controls

**User Story:** As a Founder, I want emergency controls that actually function, so that I can respond to critical operational situations.

#### Acceptance Criteria

1. WHEN a Founder activates maintenance mode and confirms the action via a confirmation prompt, THE Admin_Panel SHALL set a system-wide flag within 5 seconds that prevents all new challenge purchases, trade executions, and payout processing until the Founder deactivates it
2. WHEN a Founder activates emergency account freeze and confirms the action, THE Admin_Panel SHALL deactivate all challenge_accounts and funded_accounts system-wide (blocking login and trade execution on those accounts), and create a critical Audit_Record recording the Founder identity, timestamp, and total number of accounts affected
3. WHEN a Founder submits a global search query of at least 1 character, THE Admin_Panel SHALL query across users, challenge_accounts, funded_accounts, orders, and trades by ID, email, or account_number using partial matching and return a maximum of 50 results
4. WHEN a Founder impersonates a Staff_Member, THE Admin_Panel SHALL create a read-only session limited to 30 minutes that logs all viewed pages under both the Founder identity and the impersonated identity, and IF the 30-minute session duration elapses, THEN THE Admin_Panel SHALL automatically terminate the impersonation session and return the Founder to their normal session
5. THE Admin_Panel SHALL provide a Feature_Flag management interface that displays each flag's name, description, enabled state, and scope (global, staff, or traders), stores flags in the database, and exposes them via an API endpoint at `/api/config/flags`
6. THE Admin_Panel SHALL display system health metrics (database connection status, API response times, active sessions count, queue depth) refreshed at an interval no greater than 30 seconds, sourced from live service checks rather than static default values

### Requirement 17: Staff Creation and Management

**User Story:** As a staff member with appropriate permissions, I want to create and manage staff accounts, so that the team can be onboarded operationally.

#### Acceptance Criteria

1. WHEN a Staff_Member with `staff.create` permission submits a new staff creation form, THE Admin_Panel SHALL create a new staff_members record with a temporary password and force_password_change set to true
2. THE Admin_Panel SHALL assign roles to new staff members during creation and record the assignment in staff_role_assignments
3. WHEN a staff account is created, THE Admin_Panel SHALL send an onboarding email with temporary credentials and a link to set up 2FA
4. WHEN a Staff_Member disables another staff account, THE Admin_Panel SHALL set the staff status to `disabled` and invalidate all active sessions for that staff member
5. IF a Staff_Member lacks the `staff.create` permission, THEN THE Admin_Panel SHALL not display the staff creation button and return HTTP 403 on the API

### Requirement 18: Authentication Enforcement

**User Story:** As a security-conscious operator, I want all middleware authentication checks enforced, so that no unauthenticated request can access protected resources.

#### Acceptance Criteria

1. THE Admin_Panel SHALL remove the development mode auth bypass in middleware.ts (the `return NextResponse.next()` statement before session validation)
2. WHEN a request arrives without a valid session, THE Admin_Panel SHALL redirect page requests to `/login` and return HTTP 401 for API requests
3. THE Admin_Panel SHALL validate session tokens on every request by checking existence, idle timeout (30 minutes), and max age (8 hours)
4. WHEN a session is idle for more than 30 minutes, THE Admin_Panel SHALL invalidate the session and require re-authentication
5. THE Admin_Panel SHALL enforce RBAC permission checks on all API routes using the RBAC_Engine before executing any mutation

### Requirement 19: Session Identity in Mutations

**User Story:** As an auditor, I want every mutation to be attributed to the authenticated staff member, so that accountability is maintained in the audit trail.

#### Acceptance Criteria

1. THE Admin_Panel SHALL extract the authenticated Staff_Member ID from the session on every API mutation (POST, PUT, PATCH, DELETE)
2. THE Admin_Panel SHALL pass the authenticated Staff_Member ID as actor_id to all Audit_Record entries instead of using hardcoded placeholder UUIDs
3. THE Admin_Panel SHALL pass the authenticated Staff_Member ID to all timeline and status history entries (challenge_timeline.actor_id, payout_status_history.changed_by)
4. IF a mutation request contains no valid session identity, THEN THE Admin_Panel SHALL reject the request with HTTP 401 before performing any database write
5. THE Admin_Panel SHALL include the Staff_Member role name in the actor_role field of Audit_Records based on the highest-privilege role assigned

### Requirement 20: RBAC Enforcement on Write Operations

**User Story:** As a security-conscious operator, I want write operations gated by permissions, so that staff can only perform actions their role allows.

#### Acceptance Criteria

1. THE Admin_Panel SHALL require `challenges.create` permission for Challenge_Account creation
2. THE Admin_Panel SHALL require `challenges.manage` permission for Challenge_Account state transitions (pass, fail, reset, extend, archive, restore)
3. THE Admin_Panel SHALL require `funded.create` permission for Funded_Account creation
4. THE Admin_Panel SHALL require `funded.manage` permission for Funded_Account state transitions
5. THE Admin_Panel SHALL require `users.suspend` permission for user suspend, ban, and activate actions
6. THE Admin_Panel SHALL require `risk.manage` permission for Risk_Alert acknowledge and resolve actions
7. THE Admin_Panel SHALL require `kyc.manage` permission for KYC approve and reject actions
8. THE Admin_Panel SHALL require `settings.manage` permission for challenge rules, payout rules, and system configuration changes
9. IF a Staff_Member with Founder or Co-Founder role performs any action, THEN THE RBAC_Engine SHALL bypass permission checks and allow the action

### Requirement 21: Revenue Tracking

**User Story:** As an executive, I want real revenue data displayed on the executive dashboard, so that business performance is visible without external tools.

#### Acceptance Criteria

1. THE Admin_Panel SHALL calculate and display total revenue from completed orders grouped by day, week, and month
2. THE Admin_Panel SHALL calculate revenue breakdown by challenge_type and account_size
3. THE Admin_Panel SHALL display net revenue after subtracting refunds and payouts from gross revenue
4. WHEN the executive dashboard loads, THE Admin_Panel SHALL query actual order and payout data instead of returning placeholder values
5. THE Admin_Panel SHALL provide an API endpoint at `/api/executive/revenue` returning revenue metrics for a specified date range

### Requirement 22: Provisioning Queue Rejection and Cancellation

**User Story:** As a staff member, I want to reject or cancel provisioning queue entries, so that invalid or fraudulent orders do not proceed to account creation.

#### Acceptance Criteria

1. WHEN a Staff_Member rejects a provisioning queue entry, THE Admin_Panel SHALL transition the Provisioning_Status to `rejected` and require a rejection reason of at least 10 characters
2. WHEN a provisioning queue entry is rejected, THE Admin_Panel SHALL notify the Trader with the rejection reason via the notification system
3. WHEN a Staff_Member cancels a provisioning queue entry, THE Admin_Panel SHALL transition the Provisioning_Status to `cancelled` and initiate a refund workflow
4. THE Admin_Panel SHALL prevent provisioning of any entry with Provisioning_Status `rejected` or `cancelled`
5. THE Admin_Panel SHALL display rejected and cancelled entries in a separate archive view with the rejection or cancellation reason

### Requirement 23: Provisioning Audit Trail

**User Story:** As an auditor, I want a complete audit trail for every provisioning action, so that I can reconstruct the history of any account.

#### Acceptance Criteria

1. THE Admin_Panel SHALL record an Audit_Record for every provisioning state transition with actor_id, action, previous_state, new_state, and timestamp
2. THE Admin_Panel SHALL record an Audit_Record for every Challenge_Account and Funded_Account creation with the full account parameters in new_state
3. THE Admin_Panel SHALL record an Audit_Record for every terminal account provisioning attempt including success or failure outcome
4. THE Admin_Panel SHALL record an Audit_Record for every credential delivery attempt with delivery method and status
5. WHEN viewing an account detail page, THE Admin_Panel SHALL display the complete chronological audit history for that account

### Requirement 24: Order-to-Account Workflow Visibility

**User Story:** As a staff member, I want to see the complete journey from order to active account, so that I can track where each trader is in the provisioning pipeline.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a provisioning pipeline dashboard showing counts at each Provisioning_Status stage
2. WHEN a Staff_Member clicks on a provisioning queue entry, THE Admin_Panel SHALL display the complete workflow timeline from payment to activation
3. THE Admin_Panel SHALL display the average time spent at each provisioning stage for operational monitoring
4. THE Admin_Panel SHALL highlight provisioning entries that have been in any single stage for more than 24 hours as requiring attention
5. THE Admin_Panel SHALL provide filters on the provisioning queue by Provisioning_Status, challenge_type, payment_method, and date range

