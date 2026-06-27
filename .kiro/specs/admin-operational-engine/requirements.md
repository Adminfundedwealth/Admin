# Requirements Document

## Introduction

Transform the FundedWealth Admin (admin.fundedwealth.com) from a read-only monitoring dashboard into the full operational control center for a proprietary trading firm. The Admin Operational Engine must orchestrate the complete trader lifecycle: payment verification → account provisioning → challenge management → funded account activation → terminal integration → payout processing. This system bridges the trader-facing platform (fundedwealth.com), the administrative operations layer, and the trading terminal (MT4/MT5/cTrader).

## Glossary

- **Admin_System**: The Next.js admin application at admin.fundedwealth.com that serves as the operational control center for FundedWealth staff
- **Provisioning_Engine**: The subsystem responsible for creating and activating challenge accounts after payment verification
- **Challenge_Engine**: The subsystem responsible for creating, assigning, and managing challenge lifecycle including rules configuration
- **Funded_Engine**: The subsystem responsible for promoting passed challenges to funded trading accounts with risk profiles
- **Terminal_Adapter**: The integration layer that communicates with external trading platforms (MT4/MT5/cTrader) to provision real trading accounts
- **User_Manager**: The subsystem responsible for user lifecycle operations including approval, suspension, and banning
- **Risk_Engine**: The subsystem responsible for monitoring, alerting, and intervening on risk violations
- **Payout_Processor**: The subsystem responsible for processing trader profit withdrawals with audit trails
- **Founder_Console**: The privileged operations interface providing emergency controls, impersonation, and feature flags
- **Staff_Member**: An authenticated admin user with assigned RBAC roles and permissions
- **Trader**: An end-user of fundedwealth.com who purchases challenges and trades
- **Challenge_Account**: A trading account used during the evaluation phase with defined profit targets and drawdown limits
- **Funded_Account**: A live trading account granted after passing a challenge, with a profit-split arrangement
- **Challenge_Rules**: Configuration defining profit targets, drawdown limits, trading day requirements, and time limits for a challenge type
- **Risk_Profile**: Configuration defining daily loss limits, maximum drawdown, and position size limits for a funded account
- **Provisioning_Queue**: An ordered list of verified payments awaiting admin review and account creation
- **Audit_Trail**: An append-only log of all state-changing operations with actor identity, timestamp, and before/after state

## Requirements

### Requirement 1: Authentication Enforcement

**User Story:** As a firm owner, I want authentication enforced on all admin routes, so that unauthorized access is prevented.

#### Acceptance Criteria

1. WHEN an unauthenticated request reaches a protected route, THE Admin_System SHALL redirect page requests to the login page and return HTTP 401 for API requests
2. WHEN a Staff_Member session expires or is invalidated, THE Admin_System SHALL require re-authentication before processing subsequent requests
3. THE Admin_System SHALL identify the acting Staff_Member on every state-changing API request and record the actor identity in the Audit_Trail
4. IF a Staff_Member session token is missing or invalid, THEN THE Admin_System SHALL reject the request without processing any database mutations

### Requirement 2: Account Provisioning

**User Story:** As an operations manager, I want to provision challenge accounts after payment verification, so that paid traders can begin their evaluations promptly.

#### Acceptance Criteria

1. WHEN a payment is verified on fundedwealth.com, THE Provisioning_Engine SHALL create an entry in the Provisioning_Queue with status "pending_review"
2. WHEN a Staff_Member approves a provisioning request, THE Provisioning_Engine SHALL create a Challenge_Account with the purchased challenge type, initial balance, and associated Challenge_Rules
3. THE Provisioning_Engine SHALL assign a unique account number to each created Challenge_Account
4. WHEN a Staff_Member rejects a provisioning request, THE Provisioning_Engine SHALL record the rejection reason and mark the queue entry as "rejected"
5. THE Provisioning_Engine SHALL display the Provisioning_Queue with filtering by status, date range, and challenge type
6. IF the Provisioning_Engine fails to create the Challenge_Account in the database, THEN THE Provisioning_Engine SHALL retain the queue entry as "pending_review" and record the failure reason
7. WHEN a provisioning request is approved, THE Provisioning_Engine SHALL record the approving Staff_Member identity, timestamp, and associated payment reference in the Audit_Trail

### Requirement 3: Challenge Creation and Rules Configuration

**User Story:** As an operations manager, I want to create challenge types with configurable rules, so that the firm can offer multiple challenge products with different parameters.

#### Acceptance Criteria

1. WHEN a Staff_Member creates a new challenge type, THE Challenge_Engine SHALL persist the challenge name, profit target percentage, daily drawdown limit percentage, maximum drawdown limit percentage, minimum trading days, maximum trading days, initial balance options, and phase count
2. THE Challenge_Engine SHALL validate that profit target percentage is between 1 and 100, daily drawdown limit is between 1 and 50, maximum drawdown limit is between 1 and 100, and minimum trading days is at least 1
3. WHEN a Staff_Member modifies an existing challenge type, THE Challenge_Engine SHALL record the previous configuration and new configuration in the Audit_Trail
4. THE Challenge_Engine SHALL prevent deletion of a challenge type that has active Challenge_Accounts associated with it
5. WHEN a Staff_Member lists challenge types, THE Challenge_Engine SHALL return all configured challenge types with their current rules and active account counts

### Requirement 4: Challenge Lifecycle Management

**User Story:** As an operations manager, I want to manage active challenges through their lifecycle, so that I can pass, fail, extend, or reset challenges as needed.

#### Acceptance Criteria

1. WHEN a Staff_Member passes a Challenge_Account, THE Challenge_Engine SHALL update the status to "passed", record the completion timestamp, and make the account eligible for funded account promotion
2. WHEN a Staff_Member fails a Challenge_Account, THE Challenge_Engine SHALL update the status to "failed", record the completion timestamp and failure reason with a minimum of 20 characters
3. WHEN a Staff_Member resets a Challenge_Account, THE Challenge_Engine SHALL restore the balance to initial balance, reset all performance metrics to zero, and record a new start timestamp
4. WHEN a Staff_Member extends a Challenge_Account deadline, THE Challenge_Engine SHALL update the expiration date and record the extension reason
5. THE Challenge_Engine SHALL enforce valid state transitions and reject invalid transitions with an explanation of permitted actions for the current status
6. THE Challenge_Engine SHALL record the acting Staff_Member identity and reason for every lifecycle state change in the Audit_Trail

### Requirement 5: Funded Account Promotion

**User Story:** As an operations manager, I want to promote passed challenges to funded accounts, so that successful traders can begin live trading with firm capital.

#### Acceptance Criteria

1. WHEN a Staff_Member promotes a passed Challenge_Account, THE Funded_Engine SHALL create a Funded_Account linked to the original Challenge_Account with the configured account size, profit split percentage, and risk limits
2. THE Funded_Engine SHALL verify that the Challenge_Account status is "passed" before allowing promotion and reject promotion attempts for accounts in other states
3. WHEN a Funded_Account is created, THE Funded_Engine SHALL assign a Risk_Profile with daily drawdown limit, maximum drawdown limit, and position sizing rules
4. THE Funded_Engine SHALL prevent duplicate funded account creation from the same Challenge_Account
5. WHEN a Funded_Account is created, THE Funded_Engine SHALL record the creation event with linked challenge details, assigned risk profile, and approving Staff_Member in the Audit_Trail

### Requirement 6: Terminal Integration

**User Story:** As an operations manager, I want the admin to provision real trading platform accounts, so that funded traders receive actual MT4/MT5/cTrader credentials for live trading.

#### Acceptance Criteria

1. WHEN a Funded_Account is activated, THE Terminal_Adapter SHALL send an account creation request to the configured trading platform with the account parameters (balance, leverage, group)
2. WHEN the trading platform confirms account creation, THE Terminal_Adapter SHALL store the platform account ID, server address, and generated credentials reference against the Funded_Account
3. IF the trading platform rejects the account creation request, THEN THE Terminal_Adapter SHALL mark the Funded_Account as "pending_terminal" and record the platform error message
4. THE Terminal_Adapter SHALL support configuration for MT4, MT5, and cTrader platform connection parameters without code changes
5. WHEN a Staff_Member retries a failed terminal provisioning, THE Terminal_Adapter SHALL re-attempt the platform account creation and update the Funded_Account status upon success

### Requirement 7: User Lifecycle Management

**User Story:** As an operations manager, I want to approve, suspend, and ban users, so that I can manage the trader population and enforce compliance.

#### Acceptance Criteria

1. WHEN a Staff_Member suspends a Trader, THE User_Manager SHALL set the account status to "suspended", record the suspension reason, and prevent the Trader from opening new trades
2. WHEN a Staff_Member bans a Trader, THE User_Manager SHALL set the account status to "banned", record the ban reason, and close all active Challenge_Accounts and Funded_Accounts belonging to that Trader
3. WHEN a Staff_Member reactivates a suspended Trader, THE User_Manager SHALL set the account status to "active" and record the reactivation reason
4. THE User_Manager SHALL enforce valid user status transitions: active can transition to suspended or banned; suspended can transition to active or banned; banned is terminal
5. THE User_Manager SHALL record every user status change with the acting Staff_Member identity, reason, and timestamp in the Audit_Trail

### Requirement 8: Risk Operations

**User Story:** As a risk officer, I want to view, acknowledge, and resolve risk alerts with intervention capabilities, so that account breaches and rule violations are handled promptly.

#### Acceptance Criteria

1. WHEN a risk alert is created, THE Risk_Engine SHALL display the alert in the risk dashboard with severity, account details, breach type, and threshold violated
2. WHEN a Staff_Member acknowledges a risk alert, THE Risk_Engine SHALL update the alert status to "acknowledged" and record the acknowledging Staff_Member identity and timestamp
3. WHEN a Staff_Member resolves a risk alert, THE Risk_Engine SHALL update the alert status to "resolved", record the resolution outcome and action taken
4. WHEN a critical risk alert indicates a maximum drawdown breach, THE Risk_Engine SHALL flag the associated account for immediate review and display the breach amount
5. THE Risk_Engine SHALL allow Staff_Members to escalate alerts by changing severity from the original level to a higher level and recording the escalation reason

### Requirement 9: Payout Processing Enhancement

**User Story:** As a finance manager, I want payout operations to record the approving staff member identity and maintain a complete audit trail, so that all payment decisions are traceable.

#### Acceptance Criteria

1. WHEN a Staff_Member approves a payout, THE Payout_Processor SHALL record the authenticated Staff_Member identity as the approver rather than a placeholder value
2. WHEN a Staff_Member rejects a payout, THE Payout_Processor SHALL record the authenticated Staff_Member identity as the reviewer and persist the rejection reason
3. THE Payout_Processor SHALL maintain an append-only status history for each payout request showing every transition with actor, timestamp, and reason
4. THE Payout_Processor SHALL validate trader eligibility (KYC verified, no active violations, minimum trading days met) before allowing payout approval

### Requirement 10: Founder Emergency Controls

**User Story:** As a firm founder, I want real emergency controls that can halt operations system-wide, so that I can respond to critical incidents immediately.

#### Acceptance Criteria

1. WHEN a Founder activates the "halt payouts" control, THE Founder_Console SHALL prevent all payout approvals system-wide until the halt is lifted and record the activation in the Audit_Trail
2. WHEN a Founder activates the "halt trading" control, THE Founder_Console SHALL prevent new account provisioning and new challenge creation until the halt is lifted
3. WHEN a Founder activates a "staff lockout" control for a specific Staff_Member, THE Founder_Console SHALL invalidate all active sessions for that Staff_Member and prevent new login attempts
4. THE Founder_Console SHALL persist emergency control states in the database so they survive application restarts
5. WHEN a Founder lifts an emergency control, THE Founder_Console SHALL record the deactivation event with the Founder identity and timestamp in the Audit_Trail

### Requirement 11: Feature Flags

**User Story:** As a firm founder, I want persistent feature flags that control system behavior, so that I can enable or disable capabilities without code deployments.

#### Acceptance Criteria

1. THE Founder_Console SHALL persist feature flag states in the database with flag name, enabled status, and last-modified timestamp
2. WHEN a Founder toggles a feature flag, THE Founder_Console SHALL update the persisted state and record the change in the Audit_Trail with previous and new values
3. THE Admin_System SHALL evaluate feature flags on each request and conditionally enable or disable the associated functionality
4. WHEN a feature flag controls access to an API endpoint, THE Admin_System SHALL return HTTP 503 with a descriptive message when the flag is disabled

### Requirement 12: Impersonation

**User Story:** As a firm founder, I want to view the admin interface as another staff member sees it, so that I can troubleshoot permission issues and verify role configurations.

#### Acceptance Criteria

1. WHEN a Founder activates impersonation for a target Staff_Member, THE Founder_Console SHALL render the admin interface with the target Staff_Member permissions applied in read-only mode
2. WHILE impersonation is active, THE Founder_Console SHALL display a persistent banner indicating impersonation mode with the target Staff_Member identity
3. WHILE impersonation is active, THE Admin_System SHALL prevent all write operations and return a read-only mode indicator on any attempted mutation
4. WHEN a Founder ends impersonation, THE Founder_Console SHALL restore the Founder original permissions and record the impersonation session duration in the Audit_Trail

### Requirement 13: Payment Verification

**User Story:** As a finance manager, I want to manually verify payments and process refunds, so that edge cases not handled by automated payment processing can be resolved.

#### Acceptance Criteria

1. WHEN a Staff_Member marks a payment as verified, THE Admin_System SHALL update the payment status and create a corresponding entry in the Provisioning_Queue
2. WHEN a Staff_Member initiates a refund, THE Admin_System SHALL record the refund reason, mark the payment as refunded, and cancel any associated pending provisioning request
3. THE Admin_System SHALL display pending payments with amount, payment method, user identity, and submission timestamp
4. IF a payment is disputed, THEN THE Admin_System SHALL flag the payment for review and prevent associated provisioning until resolution

### Requirement 14: Settings and Rules Engine

**User Story:** As an operations manager, I want a working settings page where I can configure system-wide parameters, so that operational rules can be adjusted without code changes.

#### Acceptance Criteria

1. THE Admin_System SHALL provide a settings interface for configuring global operational parameters including default profit split percentage, maximum payout frequency, and support contact information
2. WHEN a Staff_Member updates a setting, THE Admin_System SHALL validate the new value against defined constraints and persist the change
3. THE Admin_System SHALL record every settings change in the Audit_Trail with previous value, new value, and acting Staff_Member identity
4. THE Admin_System SHALL load settings from the database on application startup and cache them with a maximum staleness of 60 seconds
