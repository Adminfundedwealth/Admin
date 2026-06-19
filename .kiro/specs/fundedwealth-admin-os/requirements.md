# Requirements Document

## Introduction

FundedWealth Admin OS is an enterprise-grade internal operating system for running the entire FundedWealth prop trading firm. Accessible at admin.fundedwealth.com, the system provides 18 specialized operating centers covering executive oversight, user management, challenge operations, funded trader management, payouts, KYC, risk management, trade surveillance, order monitoring, affiliates, revenue intelligence, support, marketing, certificates, system monitoring, audit/compliance, staff management, and configuration. The platform is built with Next.js, TypeScript, Tailwind CSS, shadcn/ui, and Supabase, featuring enterprise RBAC with granular permissions, comprehensive audit logging, and security-first architecture.

## Glossary

- **Admin_OS**: The FundedWealth Admin Operating System hosted at admin.fundedwealth.com
- **Staff_Member**: Any authenticated user of the Admin_OS (Founder, Co-Founder, or team member)
- **RBAC_Engine**: The Role-Based Access Control system that enforces granular permissions
- **Permission**: A granular access right in the format resource.action (e.g., users.view, payouts.approve)
- **Role**: A named collection of permissions assigned to a Staff_Member
- **Executive_Command_Center**: The dashboard providing real-time KPIs, analytics, and operational alerts
- **User_Intelligence_Center**: The centralized profile system for all platform users (traders)
- **Challenge_Operations_Center**: The system managing challenge account lifecycle
- **Funded_Trader_Center**: The system managing funded trader accounts, performance, and eligibility
- **Payout_Operations_Center**: The system managing the complete payout lifecycle with audit records
- **KYC_Verification_Center**: The system managing identity verification workflows
- **Risk_Management_Center**: The system detecting and managing risk events and violations
- **Trade_Surveillance_Center**: The system for monitoring trades, positions, and performance
- **Order_Monitoring_Center**: The system for monitoring order status and execution
- **Affiliate_Operations_Center**: The system managing affiliates, referrals, and commissions
- **Revenue_Intelligence_Center**: The system providing revenue analytics and financial reports
- **Support_Operations_Center**: The system managing support tickets and escalations
- **Marketing_Operations_Center**: The system managing campaigns, promotions, and announcements
- **Certificate_Center**: The system generating and managing trader certificates
- **System_Monitoring_Center**: The system monitoring infrastructure health and service status
- **Audit_Compliance_Center**: The immutable log of all admin actions for compliance
- **Staff_Management_Center**: The system managing staff accounts, sessions, and access
- **Configuration_Engine**: The system managing business rules, thresholds, and templates
- **Audit_Record**: An immutable log entry containing actor, role, action, timestamp, target entity, previous state, new state, IP address, and device information
- **Challenge_Account**: A trading account in evaluation phase with defined rules and targets
- **Funded_Account**: A trading account that has passed evaluation and is eligible for payouts
- **Drawdown_Breach**: A violation where account equity falls below the permitted drawdown threshold
- **Profit_Target**: The minimum profit percentage a trader must achieve to pass a challenge phase
- **Payout_Request**: A funded trader's request to withdraw profits from their funded account
- **KYC_Document**: An identity verification document submitted by a trader
- **Commission**: A payment owed to an affiliate for a referred user's purchase
- **Session**: An authenticated Staff_Member login instance with device and location metadata

## Requirements

### Requirement 1: Staff Authentication and Session Management

**User Story:** As a Staff_Member, I want to securely authenticate with individual credentials and 2FA, so that only authorized personnel can access the Admin_OS.

#### Acceptance Criteria

1. WHEN a Staff_Member submits valid credentials, THE Admin_OS SHALL create an authenticated session and record the login timestamp, IP address, and device information
2. IF a Staff_Member has 2FA enabled, THEN THE Admin_OS SHALL require a valid 2FA code within 60 seconds of code generation after credential verification before granting access
3. WHILE a Staff_Member session is active, THE Admin_OS SHALL validate the session token on every request and reject tokens that have been inactive for more than 30 minutes or exceed a maximum age of 8 hours, returning the Staff_Member to the login screen
4. IF a Staff_Member submits invalid credentials five times within ten minutes, THEN THE Admin_OS SHALL lock the account for thirty minutes and notify the Founder
5. WHEN a Staff_Member logs out, THE Admin_OS SHALL invalidate the session token and record the logout timestamp
6. THE Admin_OS SHALL store a complete login history for each Staff_Member including timestamp, IP address, device fingerprint, browser, operating system, and geolocation, retained for a minimum of 90 days
7. WHEN a Staff_Member authenticates from a previously unseen device, THE Admin_OS SHALL flag the login as new device and send an email notification to the Staff_Member
8. IF a Staff_Member submits an invalid 2FA code three times consecutively, THEN THE Admin_OS SHALL reject the authentication attempt, lock the account for fifteen minutes, and notify the Founder

### Requirement 2: Enterprise Role-Based Access Control

**User Story:** As a Founder, I want granular role-based access control with custom roles and permissions, so that each team member can only access what they need.

#### Acceptance Criteria

1. THE RBAC_Engine SHALL enforce permissions on every API request by denying access, on every page navigation by redirecting to an unauthorized notice, and on every UI component render by hiding components for which the Staff_Member lacks the required permission
2. THE RBAC_Engine SHALL support the following default roles: Founder, Co-Founder, Operations Manager, Finance Manager, Risk Manager, Support Agent, Marketing Manager, Affiliate Manager, Compliance Officer, Developer
3. WHEN a Staff_Member with the Founder or Co-Founder role authenticates, THE RBAC_Engine SHALL grant full unrestricted access to all system functions
4. THE RBAC_Engine SHALL support granular permissions in the format resource.action including: users.view, users.edit, users.ban, users.delete, payouts.view, payouts.approve, payouts.reject, kyc.view, kyc.approve, kyc.reject, risk.view, risk.manage, settings.view, settings.edit, challenges.view, challenges.manage, trades.view, affiliates.view, affiliates.manage, support.view, support.manage, marketing.view, marketing.manage, audit.view, staff.view, staff.manage, certificates.view, certificates.manage, system.view, system.manage, revenue.view
5. WHEN a Founder creates a custom role, THE RBAC_Engine SHALL allow selecting any combination of granular permissions for that role, enforce a maximum of 50 custom roles in the system, and require a role name between 3 and 50 characters
6. IF a Staff_Member attempts an action without the required permission, THEN THE RBAC_Engine SHALL deny the action, return a 403 response, and log the denied attempt in the Audit_Compliance_Center
7. WHEN a role's permissions are modified, THE RBAC_Engine SHALL enforce the updated permissions for all Staff_Members assigned that role within 5 seconds without requiring re-authentication
8. IF a Staff_Member is assigned multiple roles, THEN THE RBAC_Engine SHALL grant the union of all permissions from all assigned roles
9. IF a Staff_Member's role assignment is revoked or the assigned role is deleted, THEN THE RBAC_Engine SHALL terminate all active sessions for that Staff_Member within 5 seconds and require re-authentication

### Requirement 3: Comprehensive Audit Logging

**User Story:** As a Compliance Officer, I want every admin action logged with full context, so that there is an immutable record for compliance and investigation purposes.

#### Acceptance Criteria

1. WHEN any Staff_Member performs a state-changing action, THE Audit_Compliance_Center SHALL create an Audit_Record containing: actor identifier, actor role, action performed, timestamp in UTC with millisecond precision, target entity type, target entity identifier, previous state, new state, IP address, and device information
2. THE Audit_Compliance_Center SHALL store Audit_Records as immutable entries that cannot be modified or deleted by any Staff_Member including Founders
3. WHEN a Staff_Member queries the Audit_Compliance_Center, THE Audit_Compliance_Center SHALL support filtering by actor, action type, target entity, date range, and IP address, return results in reverse chronological order, and paginate results with a maximum of 100 records per page
4. THE Audit_Compliance_Center SHALL retain all Audit_Records for a minimum of seven years
5. WHEN a permission-denied event occurs, THE Audit_Compliance_Center SHALL log the attempted action with the same detail as a successful action plus the missing permission
6. WHEN a Staff_Member performs a bulk operation affecting multiple entities, THE Audit_Compliance_Center SHALL create one Audit_Record per affected entity, each linked by a shared batch identifier

### Requirement 4: Executive Command Center

**User Story:** As a Founder, I want a real-time executive dashboard showing all critical business metrics, so that I can monitor company health at a glance.

#### Acceptance Criteria

1. WHEN a Staff_Member with executive dashboard permission navigates to the Executive_Command_Center, THE Admin_OS SHALL display KPI cards showing: total active users, active challenge accounts, active funded accounts, total revenue (daily/weekly/monthly/all-time), pending payout requests, pending KYC reviews, open support tickets, and active risk alerts, where "active" is defined as having at least one login or account activity within the last 30 days
2. THE Executive_Command_Center SHALL display a live activity feed showing the twenty most recent significant events across all operating centers, where significant events are defined as: new user registrations, challenge purchases, challenge pass/fail outcomes, funded account activations, payout requests submitted or processed, KYC status changes, and risk alerts triggered, updated within five seconds of occurrence
3. WHEN a KPI value crosses a configured threshold, THE Executive_Command_Center SHALL display an operational alert within ten seconds, indicating a severity level of critical, warning, or informational, along with the KPI name, current value, threshold crossed, and a recommended action defined by the threshold configuration
4. THE Executive_Command_Center SHALL display revenue trend charts, conversion funnel analytics, and challenge pass/fail rate analytics with configurable date ranges between 1 day and 365 days, defaulting to the last 30 days
5. WHEN a risk alert is generated by the Risk_Management_Center, THE Executive_Command_Center SHALL display the alert within five seconds of generation
6. IF a data source required by the Executive_Command_Center is unavailable, THEN THE Executive_Command_Center SHALL display a staleness indicator on the affected KPI card or chart showing the timestamp of the last successful data retrieval, and SHALL continue displaying the remaining available metrics without interruption

### Requirement 5: User Intelligence Center

**User Story:** As an Operations Manager, I want a single comprehensive view of every user with all their associated data, so that I can understand and manage any user situation completely.

#### Acceptance Criteria

1. WHEN a Staff_Member searches for a user, THE User_Intelligence_Center SHALL support search by email, username, user ID, phone number, and trading account number, matching on exact or partial input of at least 3 characters, and return results within 3 seconds
2. IF a search returns no matching users, THEN THE User_Intelligence_Center SHALL display a message indicating no results were found for the given query
3. WHEN a Staff_Member opens a user profile, THE User_Intelligence_Center SHALL display: personal information, KYC status, purchase history, challenge accounts, funded accounts, trade history summary, payout history, referral information, support ticket history, login history, registered devices, and internal staff notes
4. WHEN a Staff_Member adds an internal note to a user profile, THE User_Intelligence_Center SHALL store the note with the author, timestamp, and note category, enforcing a minimum length of 10 characters and a maximum length of 5000 characters for the note body
5. WHEN a Staff_Member opens a user profile, THE User_Intelligence_Center SHALL display a timeline of all user events in reverse chronological order, showing the most recent 50 events by default with the ability to load older events
6. WHEN a Staff_Member performs an action on a user (ban, suspend, modify), THE User_Intelligence_Center SHALL require a reason of at least 10 characters and create an Audit_Record linking the Staff_Member, action type, target user, reason, and timestamp
7. WHEN a Staff_Member applies filters to a user list, THE User_Intelligence_Center SHALL support filtering by KYC status, account status, registration date range, and country, and support bulk operations on up to 100 selected users at a time with permission validation for each operation
8. IF a Staff_Member attempts a bulk operation without the required permission for that operation type, THEN THE User_Intelligence_Center SHALL reject the entire batch and display a message indicating insufficient permissions

### Requirement 6: Challenge Operations Center

**User Story:** As an Operations Manager, I want to manage the complete lifecycle of every challenge account, so that I can handle passes, failures, retries, resets, and escalations efficiently.

#### Acceptance Criteria

1. THE Challenge_Operations_Center SHALL display all challenge accounts in a paginated list with a default page size of 20, showing status (active, passed, failed, expired, archived), and support filtering by status, challenge type, date range, and user
2. WHEN a challenge account meets all pass criteria, THE Challenge_Operations_Center SHALL flag the account for review and display pass confirmation details including: profit target achieved, drawdown compliance, minimum trading days completed, challenge phase, and completion date
3. WHEN a Staff_Member performs an action on a challenge account (pass, fail, retry, reset, extend, upgrade, archive, restore), THE Challenge_Operations_Center SHALL record the action in the account timeline with actor, timestamp, and a mandatory reason of at least 10 characters
4. WHEN a Staff_Member manually passes or fails a challenge account, THE Challenge_Operations_Center SHALL require a written justification of at least 20 characters and verify the Staff_Member holds the challenges.manage permission before executing the action
5. THE Challenge_Operations_Center SHALL display a complete timeline history for each challenge account showing every state change, trade summary (total trades, win rate, profit/loss, and drawdown usage), and staff interaction
6. WHEN a Staff_Member resets a challenge account, THE Challenge_Operations_Center SHALL preserve the original account data (trade history, performance metrics, and rule compliance status) in history and create a new evaluation period with the same duration and rules as the original challenge configuration
7. IF a Staff_Member attempts a state transition that is not valid for the account's current status, THEN THE Challenge_Operations_Center SHALL reject the action and display an error message indicating the current status and the permitted transitions from that status
8. IF a Staff_Member attempts an action on a challenge account and the action fails due to a system error, THEN THE Challenge_Operations_Center SHALL display an error message indicating the failure reason and preserve the account's previous state unchanged

### Requirement 7: Funded Trader Center

**User Story:** As a Finance Manager, I want to monitor all funded traders' performance and eligibility, so that I can manage profit sharing and ensure compliance with trading rules.

#### Acceptance Criteria

1. THE Funded_Trader_Center SHALL display all funded accounts with current equity, profit/loss, drawdown usage as a percentage of the configured maximum, violation count, and payout eligibility status (eligible or ineligible with reason)
2. WHEN a funded account breaches a daily or maximum drawdown rule, THE Funded_Trader_Center SHALL immediately flag the account with a visual indicator and notify the Risk_Management_Center within 5 seconds of detection
3. THE Funded_Trader_Center SHALL calculate and display real-time profit share amounts based on the configured profit split percentage, showing both the trader's share and the firm's share
4. WHEN a funded trader becomes eligible for a payout, THE Funded_Trader_Center SHALL display eligibility confirmation listing all qualifying criteria met including: minimum trading days, profit threshold, no active violations, and KYC verified status
5. THE Funded_Trader_Center SHALL display a performance dashboard for each funded trader showing equity curve, daily P&L for the last 30 days, trade statistics (total trades, win rate, average win, average loss), and rule compliance status for each configured rule
6. WHEN a Staff_Member modifies a funded account's status or parameters, THE Funded_Trader_Center SHALL require a reason of at least 10 characters and create an Audit_Record

### Requirement 8: Payout Operations Center

**User Story:** As a Finance Manager, I want to manage the complete payout lifecycle with full audit trails, so that every payout is properly reviewed, approved, and tracked.

#### Acceptance Criteria

1. WHEN a trader submits a payout request, THE Payout_Operations_Center SHALL display the request with: trader name, trader email, trader account identifier, funded account number, funded account balance, requested amount (between 0.01 and 999,999,999.99), profit share percentage and calculated payout, account profit/loss since last payout, and eligibility verification status (eligible or ineligible with reason)
2. THE Payout_Operations_Center SHALL enforce a multi-step workflow with statuses: request received, under review, approved, payment processing, payment completed, and payment failed, with each transition requiring Staff_Member action and creating an Audit_Record containing the previous status, new status, Staff_Member identity, and timestamp
3. WHEN a Staff_Member approves a payout, THE Payout_Operations_Center SHALL verify the approver has payouts.approve permission and record the approval with timestamp and approver identity
4. IF a Staff_Member attempts to approve a payout without payouts.approve permission, THEN THE Payout_Operations_Center SHALL reject the action, display an error message indicating insufficient permissions, and create an Audit_Record of the denied attempt
5. WHEN a Staff_Member rejects a payout, THE Payout_Operations_Center SHALL require a rejection reason of 10 to 1000 characters, send a notification to the trader indicating the rejection and reason, and record the rejection as an Audit_Record
6. IF a payout in payment processing status fails to complete, THEN THE Payout_Operations_Center SHALL transition the payout to payment failed status, record the failure reason as an Audit_Record, and allow a Staff_Member to retry or cancel the payout
7. THE Payout_Operations_Center SHALL maintain an append-only history of all payout requests where no record may be modified or deleted after creation, including amount, all status transitions, reviewers, approvers, payment method, transaction references, and timestamps
8. THE Payout_Operations_Center SHALL display aggregate payout analytics including: total paid out grouped by day, week, and month, total pending amount, average processing time from request received to payment completed, and rejection rate as a percentage of total requests

### Requirement 9: KYC Verification Center

**User Story:** As a Compliance Officer, I want to manage identity verification workflows with document review and approval processes, so that only verified traders receive funded accounts and payouts.

#### Acceptance Criteria

1. WHEN a trader submits KYC documents, THE KYC_Verification_Center SHALL display the submission in the review queue with document images, trader name, email, account ID, submission timestamp, and current verification status
2. THE KYC_Verification_Center SHALL support the following document types: government-issued ID (front and back), proof of address (utility bill or bank statement dated within 90 days), selfie with ID, and up to 3 additional supporting documents as required
3. WHEN a Staff_Member reviews a KYC submission, THE KYC_Verification_Center SHALL allow approval, rejection with at least one selected reason from a predefined list of rejection reasons, or request for re-submission with written instructions specifying which documents to replace and why
4. IF a Staff_Member opens a KYC submission that is already being reviewed by another Staff_Member, THEN THE KYC_Verification_Center SHALL display a notification indicating the submission is currently under review and by whom
5. WHEN a Staff_Member approves a KYC submission, THE KYC_Verification_Center SHALL update the trader's verification status to "verified," record the reviewer identity and timestamp, and create an Audit_Record
6. WHEN a Staff_Member rejects a KYC submission, THE KYC_Verification_Center SHALL update the trader's verification status to "rejected," notify the trader, and allow the trader to resubmit up to 3 times before requiring manual escalation
7. IF a KYC submission has been pending review for more than forty-eight hours, THEN THE KYC_Verification_Center SHALL move the submission to the overdue queue and send a notification to the assigned compliance team lead
8. THE KYC_Verification_Center SHALL display verification analytics including: submissions per day for the last 30 days, average review time in hours, approval rate as a percentage, rejection reasons breakdown by category, and current pending queue depth

### Requirement 10: Risk Management Center

**User Story:** As a Risk Manager, I want to detect and manage drawdown breaches, rule violations, and trading anomalies, so that the firm's capital is protected.

#### Acceptance Criteria

1. WHEN a trading account breaches a daily or maximum drawdown rule, THE Risk_Management_Center SHALL generate a risk alert with severity level (low, medium, high, critical), account details, breach type, breach amount, and the configured threshold that was violated
2. THE Risk_Management_Center SHALL display all active risk alerts sorted by severity (critical first) with filtering by alert type, account, severity, and date range
3. WHEN a Risk Manager acknowledges or resolves a risk alert, THE Risk_Management_Center SHALL transition the alert state from open to acknowledged or resolved, and record the transition with actor, timestamp, action taken, and resolution outcome (account suspended, rule adjusted, false positive, or escalated)
4. THE Risk_Management_Center SHALL detect and flag trading anomalies based on configurable thresholds defined in the Configuration_Engine, including: position sizes exceeding the configured multiple of account average, trade frequency exceeding the configured maximum trades per time window, correlating accounts with matching trade patterns, and prohibited trading strategies as defined in the challenge rules
5. THE Risk_Management_Center SHALL display a risk dashboard showing: total accounts at risk, breach frequency trends over configurable time periods, top 10 violated rules, and capital exposure summary with total dollars at risk
6. WHEN a risk event with severity level critical or high is generated, THE Risk_Management_Center SHALL deliver a notification to all Staff_Members with the risk.manage permission within 30 seconds of detection
7. IF an active risk alert is not acknowledged within 15 minutes of generation, THEN THE Risk_Management_Center SHALL escalate the alert by increasing its severity level by one tier and re-notifying Staff_Members with the risk.manage permission

### Requirement 11: Trade Surveillance Center

**User Story:** As a Risk Manager, I want to monitor all trades across all accounts with advanced filtering, so that I can investigate trading patterns and ensure compliance.

#### Acceptance Criteria

1. THE Trade_Surveillance_Center SHALL display trades in a paginated table with a default page size of 50 rows and selectable page sizes of 50, 100, or 200, showing for each trade: account identifier, trader, symbol, direction, lot size, entry price, exit price, profit/loss, duration, entry timestamp, and exit timestamp
2. THE Trade_Surveillance_Center SHALL support filtering by account, trader, symbol, direction, date range, profit/loss range, lot size range, and duration range, where all active filters are combined using AND logic
3. WHEN a Staff_Member selects a specific account, THE Trade_Surveillance_Center SHALL display all positions (open and closed), trade history, and performance statistics for that account including: total trades, win rate, average profit, average loss, profit factor, and total profit/loss
4. THE Trade_Surveillance_Center SHALL support exporting filtered trade data to CSV format, limited to a maximum of 50,000 rows per export
5. THE Trade_Surveillance_Center SHALL display aggregate statistics for the current filter selection including: total trades, win rate, average profit, average loss, top 5 most traded symbols by volume, and top 5 peak trading hours by trade count
6. IF the applied filters return no matching trades, THEN THE Trade_Surveillance_Center SHALL display an empty state message indicating no trades match the current filter criteria and preserve all filter selections
7. WHEN a Staff_Member applies filters or loads the Trade_Surveillance_Center, THE system SHALL display results within 3 seconds for queries spanning up to 30 days of trade data

### Requirement 12: Order Monitoring Center

**User Story:** As an Operations Manager, I want to monitor all orders across trading accounts, so that I can identify execution issues and investigate order rejections.

#### Acceptance Criteria

1. THE Order_Monitoring_Center SHALL display orders in a paginated list showing a maximum of 50 orders per page with the following columns: account identifier, trader, symbol, order type, direction, volume, price, status (open, filled, cancelled, rejected), submission timestamp, and execution timestamp
2. THE Order_Monitoring_Center SHALL display orders sorted by submission timestamp in descending order by default
3. THE Order_Monitoring_Center SHALL support filtering by status, account, symbol, order type, and date range with a default date range of the current day and a maximum selectable range of 90 days
4. WHEN an order is rejected, THE Order_Monitoring_Center SHALL display the rejection reason alongside the order row and visually distinguish the rejected order with a persistent indicator until a user acknowledges it
5. THE Order_Monitoring_Center SHALL display order execution analytics for a selectable period (current day, 7 days, 30 days) including: fill rate as a percentage of total orders filled, average fill time in milliseconds, rejection rate grouped by rejection reason as a percentage of total orders, and cancellation rate as a percentage of total orders cancelled
6. IF no orders match the applied filters, THEN THE Order_Monitoring_Center SHALL display an empty-state message indicating no orders were found for the selected criteria

### Requirement 13: Affiliate Operations Center

**User Story:** As an Affiliate Manager, I want to manage all affiliates, track referrals, calculate commissions, and process affiliate payouts, so that the affiliate program runs smoothly.

#### Acceptance Criteria

1. THE Affiliate_Operations_Center SHALL display all affiliates with: name, email, unique affiliate code, referral count, total revenue generated, commission earned, commission paid, commission pending, and account status (active, suspended, terminated)
2. WHEN a referred user makes a purchase, THE Affiliate_Operations_Center SHALL calculate the commission based on the configured commission structure and add it to the affiliate's pending balance within 60 seconds of purchase confirmation
3. THE Affiliate_Operations_Center SHALL support configurable commission structures including: flat rate per sale, percentage of sale, tiered rates based on volume (with configurable tier thresholds), and recurring commissions for repeat purchases by referred users
4. WHEN an affiliate requests a commission payout, THE Affiliate_Operations_Center SHALL display the request for review with affiliate details, total earned amount, amount requested, payout history, and configured minimum payout threshold
5. WHEN a Staff_Member approves or rejects an affiliate commission payout, THE Affiliate_Operations_Center SHALL require the affiliates.manage permission, record the decision as an Audit_Record, and notify the affiliate of the outcome
6. IF a referred user's purchase is refunded, THEN THE Affiliate_Operations_Center SHALL reverse the associated commission from the affiliate's pending balance and create an Audit_Record documenting the reversal
7. THE Affiliate_Operations_Center SHALL display referral analytics including: referral conversion rate, revenue by affiliate, top 10 performing affiliates by revenue, and commission expense trends over configurable time periods
8. WHEN a Staff_Member modifies an affiliate's commission structure or status, THE Affiliate_Operations_Center SHALL create an Audit_Record with the change details

### Requirement 14: Revenue Intelligence Center

**User Story:** As a Founder, I want comprehensive revenue analytics and financial reporting, so that I can make data-driven business decisions.

#### Acceptance Criteria

1. THE Revenue_Intelligence_Center SHALL display revenue metrics including: total revenue, revenue by challenge type, revenue by period (daily/weekly/monthly/quarterly/yearly), average order value, and customer lifetime value
2. THE Revenue_Intelligence_Center SHALL display conversion analytics including: visitor to signup rate, signup to purchase rate, purchase to pass rate, and funnel drop-off percentage at each stage of the conversion funnel
3. THE Revenue_Intelligence_Center SHALL display challenge sales analytics including: sales volume, sales by challenge type, sales by country, refund rate, and chargeback rate
4. WHEN a Staff_Member selects a date range, THE Revenue_Intelligence_Center SHALL recalculate all displayed metrics for the selected period and display updated results within five seconds
5. THE Revenue_Intelligence_Center SHALL default to displaying metrics for the current calendar month when no date range is selected
6. THE Revenue_Intelligence_Center SHALL support exporting the currently displayed revenue metrics, conversion analytics, and sales analytics as a financial report in CSV and PDF formats
7. IF the Revenue_Intelligence_Center cannot retrieve analytics data from the data source, THEN THE Revenue_Intelligence_Center SHALL display an error message indicating the data is temporarily unavailable and show the timestamp of the last successful data load

### Requirement 15: Support Operations Center

**User Story:** As a Support Agent, I want to manage support tickets with escalation workflows and resolution tracking, so that trader issues are resolved efficiently.

#### Acceptance Criteria

1. THE Support_Operations_Center SHALL display all support tickets in a paginated list (20 tickets per page) with: ticket ID, trader, subject, category, priority (low, medium, high, critical), status (open, in-progress, escalated, resolved, closed), assigned agent, created timestamp, and last-updated timestamp
2. WHEN a Staff_Member opens a ticket, THE Support_Operations_Center SHALL display the complete conversation history in chronological order, the trader profile summary, and up to 10 most recent tickets from the same trader as related tickets
3. WHEN a Support Agent escalates a ticket, THE Support_Operations_Center SHALL require an escalation reason (minimum 10 characters), assign the ticket to the team mapped to the ticket's category, update the ticket status to "escalated", and send a notification to the assigned team
4. IF a Support Agent submits an escalation with a reason shorter than 10 characters or with no matching team for the ticket category, THEN THE Support_Operations_Center SHALL display an error message indicating the specific validation failure and retain the current ticket state
5. THE Support_Operations_Center SHALL track resolution metrics calculated over selectable time windows (today, last 7 days, last 30 days) including: average first response time, average resolution time, tickets per agent, satisfaction ratings (scale of 1 to 5), and resolution rate percentage by category
6. IF a ticket remains in "open" or "in-progress" status beyond the configured SLA threshold for its priority level, THEN THE Support_Operations_Center SHALL flag the ticket as "SLA-breached" with a visual indicator and send a notification to the team lead
7. WHEN a Support Agent marks a ticket as "resolved", THE Support_Operations_Center SHALL record the resolution timestamp, calculate the total resolution time from ticket creation, and transition the ticket status to "resolved"

### Requirement 16: Marketing Operations Center

**User Story:** As a Marketing Manager, I want to manage campaigns, promotions, announcements, and coupons, so that marketing initiatives are organized and trackable.

#### Acceptance Criteria

1. THE Marketing_Operations_Center SHALL support creating and managing promotions with: name (maximum 100 characters), description (maximum 500 characters), discount type (percentage or fixed), discount value (1–100 for percentage, 0.01–999,999.99 for fixed amount in account currency), applicable challenge types, start date, end date, usage limit (1–1,000,000), and status (draft, active, expired, disabled)
2. WHEN a promotion's end date passes, THE Marketing_Operations_Center SHALL automatically transition its status from active to expired
3. THE Marketing_Operations_Center SHALL support creating and managing coupon codes with: unique alphanumeric code (4–32 characters), discount type (percentage or fixed), discount value (same bounds as promotions), validity period (start and end date), usage limit per user (1–100), total usage limit (1–1,000,000), and minimum purchase amount (0.00–999,999.99)
4. IF a Staff_Member attempts to create a coupon code that already exists or a promotion with a discount value outside the permitted bounds, THEN THE Marketing_Operations_Center SHALL reject the operation and display an error message indicating the validation failure
5. WHEN a Staff_Member creates or modifies a promotion or coupon, THE Marketing_Operations_Center SHALL create an Audit_Record
6. THE Marketing_Operations_Center SHALL display campaign analytics including: coupon usage count, total revenue from orders that applied each promotion, and conversion rate per campaign calculated as the number of completed purchases using the promotion divided by the number of unique users who viewed the promotion
7. THE Marketing_Operations_Center SHALL support creating system-wide announcements with: title (maximum 150 characters), content (maximum 5,000 characters), target audience (all users, active traders, funded traders, or affiliates), display period (start and end date), and priority level (low, medium, high, critical)

### Requirement 17: Certificate Center

**User Story:** As an Operations Manager, I want to generate and manage certificates for traders who pass challenges or become funded, so that achievements are formally recognized.

#### Acceptance Criteria

1. WHEN a trader passes a challenge phase, THE Certificate_Center SHALL generate a PDF challenge completion certificate containing a unique certificate identifier, trader name, challenge type, completion date, profit target achieved, and trading period duration
2. WHEN a trader receives a funded account, THE Certificate_Center SHALL generate a PDF funded trader certificate containing a unique certificate identifier, trader name, account size, funding date, and program name
3. THE Certificate_Center SHALL display all generated certificates with filtering by type, trader, and date range, showing certificate identifier, trader name, certificate type, generation date, and current status
4. WHEN a Staff_Member manually triggers certificate generation, THE Certificate_Center SHALL validate that the trader has a corresponding passed challenge or funded account before generating the certificate
5. IF the trader's eligibility validation fails during manual certificate generation, THEN THE Certificate_Center SHALL reject the generation request and display an error message indicating the specific eligibility requirement not met
6. WHEN a Staff_Member selects a certificate, THE Certificate_Center SHALL provide the ability to download the certificate in PDF format and to revoke the certificate with a required reason

### Requirement 18: System Monitoring Center

**User Story:** As a Developer, I want to monitor all system services and infrastructure health, so that I can identify and resolve issues before they impact users.

#### Acceptance Criteria

1. THE System_Monitoring_Center SHALL display health status for: API services, database connections, WebSocket connections, email delivery service, payment processing service, and background job queues, where each service displays one of three states: "healthy" (responding within expected thresholds), "degraded" (responding but exceeding performance thresholds), or "down" (not responding or returning errors), refreshed at least every 30 seconds
2. WHEN a monitored service status changes from healthy to degraded or down, THE System_Monitoring_Center SHALL generate an alert within 60 seconds and notify Staff_Members with system.manage permission, including the affected service name, previous state, new state, and timestamp of change
3. THE System_Monitoring_Center SHALL display performance metrics including: API response times (p50, p95, p99 in milliseconds), database query time (average and p95 in milliseconds), WebSocket active connection count, and background job completion rate (percentage of jobs completed successfully), calculated over a rolling 24-hour window
4. THE System_Monitoring_Center SHALL display a service dependency map showing the health state (healthy, degraded, or down) of all external integrations including payment processors, email services, and trading platform APIs
5. WHEN a background job fails, THE System_Monitoring_Center SHALL log the failure details (job name, error description, timestamp, and attempt number) and display it in the failed jobs queue with retry capability limited to a maximum of 3 retry attempts per job
6. IF a monitored service cannot be reached during a health check, THEN THE System_Monitoring_Center SHALL mark that service as "down" and display the time since the last successful health check response
7. IF a background job retry also fails after exhausting the maximum 3 attempts, THEN THE System_Monitoring_Center SHALL mark the job as "permanently failed" and include it in the alert notification sent to Staff_Members with system.manage permission

### Requirement 19: Staff Management Center

**User Story:** As a Founder, I want to manage all staff accounts with full security controls, so that team access is properly governed.

#### Acceptance Criteria

1. WHEN a Founder creates a new Staff_Member account, THE Staff_Management_Center SHALL require: email (valid format, unique across all accounts), name (1–100 characters), assigned role, and generate a temporary password of minimum 12 characters containing uppercase, lowercase, digits, and special characters that expires after 24 hours if unused
2. IF a Founder attempts to create a Staff_Member account with an email already associated with an existing account, THEN THE Staff_Management_Center SHALL reject the creation and display an error message indicating the email is already in use
3. THE Staff_Management_Center SHALL display for each Staff_Member: name, email, account creation date, last login date, assigned role, permissions, 2FA enrollment status, active sessions (device type, operating system, IP address, last activity timestamp), registered devices (maximum 10), and login history for the most recent 90 days
4. WHEN a Founder disables a Staff_Member account, THE Staff_Management_Center SHALL invalidate all active sessions for that Staff_Member within 5 seconds and prevent any new login attempts for that account
5. WHEN a Staff_Member logs in for the first time, THE Staff_Management_Center SHALL require 2FA enrollment before granting access to any system functionality, and IF the Staff_Member does not complete 2FA enrollment, THEN THE Staff_Management_Center SHALL deny access and terminate the session
6. WHEN a Staff_Member's session is active from multiple devices simultaneously, THE Staff_Management_Center SHALL display all active sessions with device type, operating system, IP address, and last activity timestamp, and allow the Founder to selectively revoke individual sessions
7. THE Staff_Management_Center SHALL display a permission audit log showing all permission changes for each Staff_Member with timestamps and the actor who made the change, retained for a minimum of 365 days and paginated at 50 entries per page

### Requirement 20: Configuration and Rule Engine

**User Story:** As a Founder, I want to configure all business rules, thresholds, and templates without code changes, so that the business can adapt quickly to market conditions.

#### Acceptance Criteria

1. THE Configuration_Engine SHALL support configuring challenge rules including: profit targets per phase, daily drawdown limits, maximum drawdown limits, minimum trading days, maximum trading days, and prohibited trading strategies, where each numeric parameter has a defined minimum and maximum allowable value that the system enforces
2. THE Configuration_Engine SHALL support configuring payout rules including: minimum payout amount, payout frequency, profit split percentages (ranging from 0% to 100%), and payout processing timeframes (specified in calendar days)
3. THE Configuration_Engine SHALL support configuring affiliate rules including: commission rates, payout thresholds, and tier structures
4. THE Configuration_Engine SHALL support configuring notification templates for: email notifications, system announcements, and alert messages
5. WHEN a Staff_Member modifies any configuration value, THE Configuration_Engine SHALL create an Audit_Record capturing the Staff_Member identity, timestamp of the change, the configuration field modified, the previous value, and the new value
6. IF a configuration change fails validation against business rule constraints, THEN THE Configuration_Engine SHALL reject the change, preserve the existing configuration value, and display an error message indicating which constraint was violated and the acceptable range or format
7. THE Configuration_Engine SHALL support configuration versioning, allowing Staff_Members to view the history of changes for at least the most recent 50 versions per configuration category and revert to a previous configuration version
8. WHEN a Staff_Member initiates a revert to a previous configuration version, THE Configuration_Engine SHALL display a confirmation prompt indicating which values will change before applying the revert

### Requirement 21: Real-Time Data and Notifications

**User Story:** As a Staff_Member, I want real-time updates and notifications for critical events, so that I can respond to issues immediately.

#### Acceptance Criteria

1. WHEN a critical event occurs (risk alert, payout request, KYC submission, system alert), THE Admin_OS SHALL deliver a real-time notification within five seconds of the event to all Staff_Members who hold the corresponding permission (risk.manage for risk alerts, payouts.view for payout requests, kyc.view for KYC submissions, system.manage for system alerts)
2. THE Admin_OS SHALL support in-app notifications with read/unread status, four priority levels (Critical, High, Medium, Low), timestamp, event source, and a direct link to the relevant operating center where the event originated
3. WHILE a Staff_Member is viewing a data table or dashboard, THE Admin_OS SHALL reflect data changes within five seconds of occurrence without requiring page refresh
4. THE Admin_OS SHALL support configurable notification preferences per Staff_Member allowing selection of which event types trigger notifications and which priority levels are displayed
5. IF the real-time connection between a Staff_Member's session and the server is lost, THEN THE Admin_OS SHALL display a connection status indicator and deliver any missed notifications upon reconnection

### Requirement 22: Search and Navigation

**User Story:** As a Staff_Member, I want fast global search and intuitive navigation, so that I can find any information or reach any function quickly.

#### Acceptance Criteria

1. THE Admin_OS SHALL provide a global search function accessible via Ctrl+K (Windows) or Cmd+K (Mac) keyboard shortcut that searches across users, accounts, tickets, transactions, and all entity types
2. WHEN a Staff_Member enters at least 2 characters in the global search field, THE Admin_OS SHALL return results within 2 seconds, grouped by entity type, displaying a maximum of 5 results per entity type with direct navigation links and a "view all" option per group if more results exist
3. IF a global search returns no matching results, THEN THE Admin_OS SHALL display an empty-state message indicating no results were found for the entered query
4. THE Admin_OS SHALL display a sidebar navigation listing all 18 operating centers with badge counts showing the number of items in a pending or unresolved state per center, updated at least every 60 seconds without requiring a page reload
5. THE Admin_OS SHALL only display navigation items and search results for which the Staff_Member has view permission

### Requirement 23: Data Export and Reporting

**User Story:** As a Finance Manager, I want to export data and generate reports from any operating center, so that I can perform external analysis and satisfy reporting requirements.

#### Acceptance Criteria

1. THE Admin_OS SHALL support data export in CSV format from all operating centers that display tabular data, applying any active filters and sort order to the exported dataset
2. WHEN a Staff_Member initiates a data export exceeding ten thousand records, THE Admin_OS SHALL process the export asynchronously, notify the Staff_Member via in-app notification when the file is ready, and make the file available for download for twenty-four hours
3. THE Admin_OS SHALL enforce permission checks on all export operations ensuring Staff_Members can only export data they have permission to view
4. THE Admin_OS SHALL log all data export operations in the Audit_Compliance_Center with the exporter, export scope, record count, and timestamp
5. IF a data export operation fails due to timeout or system error, THEN THE Admin_OS SHALL notify the requesting Staff_Member with an error message indicating the failure reason and allow the Staff_Member to retry the export
6. THE Admin_OS SHALL limit a single data export operation to a maximum of five hundred thousand records

### Requirement 24: System Architecture and Scalability

**User Story:** As a Developer, I want the system architected for long-term scalability and maintainability, so that the platform can grow with the business.

#### Acceptance Criteria

1. THE Admin_OS SHALL implement a modular architecture where each operating center is an independent module with its own routes, components, API endpoints, and data access layer, such that no module directly imports from another module's internal files
2. THE Admin_OS SHALL implement server-side rendering for initial page loads and client-side navigation for subsequent interactions using Next.js App Router
3. THE Admin_OS SHALL implement database access through Supabase with Row Level Security policies enforcing the RBAC permissions at the database level
4. THE Admin_OS SHALL implement API rate limiting per Staff_Member with a default limit of 100 requests per minute for read endpoints and 30 requests per minute for write endpoints, configurable per endpoint category within a range of 10 to 1000 requests per minute
5. IF a Staff_Member exceeds the configured rate limit for an endpoint category, THEN THE Admin_OS SHALL reject the request, return an error indicating rate limit exceeded along with the number of seconds until the limit resets, and preserve all prior successful operations unchanged
6. THE Admin_OS SHALL implement optimistic UI updates with server validation for all state-changing operations, where the UI immediately reflects the expected result of the action
7. IF server validation rejects an optimistic UI update, THEN THE Admin_OS SHALL revert the UI to the last server-confirmed state within 2 seconds and display an error message indicating the reason for rejection
8. THE Admin_OS SHALL support horizontal scaling through stateless application design with session state stored in Supabase, supporting at least 500 concurrent authenticated Staff_Member sessions without degradation in response times beyond 200ms per API request at the 95th percentile

### Requirement 25: UI Framework and Design System

**User Story:** As a Developer, I want a consistent design system and component library, so that the interface is professional, accessible, and maintainable.

#### Acceptance Criteria

1. THE Admin_OS SHALL implement the UI using shadcn/ui components with Tailwind CSS where all components reference a shared design token system for colors, spacing, typography, and elevation rather than hardcoded values
2. THE Admin_OS SHALL implement responsive layouts supporting desktop displays from a minimum viewport width of 1280 pixels up to 2560 pixels without horizontal scrolling, content overflow, or layout breakage
3. THE Admin_OS SHALL implement accessible interfaces compliant with WCAG 2.1 Level AA including full keyboard navigation for all interactive elements, screen reader support with appropriate ARIA labels, and a minimum color contrast ratio of 4.5:1 for normal text and 3:1 for large text and interactive components
4. THE Admin_OS SHALL implement a dark mode and light mode with system preference detection on initial load and a manual toggle that persists the user's choice across sessions
5. WHEN a data-dependent view initiates a data request that exceeds 300 milliseconds without a response, THE Admin_OS SHALL display a loading indicator until data is received or an error occurs
6. IF a data request fails for a data-dependent view, THEN THE Admin_OS SHALL display an error state indicating the nature of the failure and providing a retry action
7. WHEN a data-dependent view receives a successful response containing no records, THE Admin_OS SHALL display an empty state with a descriptive message indicating no data is available
