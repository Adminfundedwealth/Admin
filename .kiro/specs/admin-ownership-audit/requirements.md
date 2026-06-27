# Requirements Document

## Introduction

This document defines the ownership classification rules for admin.fundedwealth.com and provides the authoritative ownership map for every feature currently present in the codebase. The admin panel must own ONLY internal operational concerns (user management, account provisioning, challenge management, KYC approval, payout approval, risk monitoring, support management, audit logs, staff management, permissions, and operational monitoring). Features that serve end-users, public visitors, or trader terminals must be relocated to the appropriate domain. Dead code and duplicated functionality must be identified for removal.

This is a classification and documentation exercise. No implementation or code changes are prescribed — only the ownership decision for each feature.

## Glossary

- **Admin_Panel**: The internal staff-facing application at admin.fundedwealth.com used for business operations
- **Website**: The public-facing application at fundedwealth.com serving traders, visitors, and marketing content
- **Terminal**: The trader-facing application at terminal.fundedwealth.com providing trading interfaces, charts, positions, orders, and market data
- **Ownership_Classifier**: The rule engine that determines which domain owns a given feature
- **Feature**: A distinct page, API route, or component group that delivers a cohesive capability
- **Classification_Label**: One of KEEP, MOVE_TO_WEBSITE, MOVE_TO_TERMINAL, DELETE, or DEPRECATED
- **Admin_Scope**: The set of capabilities that legitimately belong to internal operations staff
- **One_Owner_Principle**: The rule that each feature must have exactly one owning domain

## Requirements

### Requirement 1: Admin Scope Definition

**User Story:** As a platform architect, I want a clear definition of what admin.fundedwealth.com should own, so that ownership boundaries are unambiguous.

#### Acceptance Criteria

1. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for User Management operations — defined as viewing, searching, editing, suspending, or investigating trader accounts by authenticated admin users
2. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Account Provisioning operations — defined as creating, configuring, or assigning trading accounts (challenge or funded) to traders
3. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Challenge Management operations — defined as approval, review, pass/fail decisions, rule configuration, and progress monitoring of trader challenges
4. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for KYC Approval operations — defined as reviewing, approving, or rejecting identity verification submissions
5. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Payout Approval operations — defined as reviewing, approving, rejecting, or batch-processing payout requests
6. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Risk Monitoring operations — defined as viewing risk alerts, capital exposure, drawdown breaches, and position concentration across all trader accounts
7. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Support Management operations — defined as viewing, assigning, escalating, and resolving customer support tickets
8. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Audit Logs operations — defined as viewing immutable records of all system and staff actions for compliance purposes
9. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Staff Management operations — defined as creating, editing, deactivating staff accounts and assigning roles
10. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Permissions and Role Management operations — defined as defining roles, assigning permissions, and enforcing access control for admin users
11. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Operational Monitoring operations — defined as viewing system health dashboards, service status, error rates, and infrastructure metrics
12. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Revenue Intelligence operations — defined as internal financial reporting, MRR tracking, conversion analytics, and business decision support dashboards
13. THE Ownership_Classifier SHALL classify a feature as KEEP when the feature serves internal staff for Founder-level controls — defined as emergency system overrides, staff activity auditing, user impersonation for debugging, feature flag management, system-wide notifications, and data export capabilities
14. IF a feature is accessible without admin authentication or serves traders, affiliates, or public visitors as its primary audience, THEN THE Ownership_Classifier SHALL NOT classify that feature as KEEP regardless of whether it touches data managed by admin operations
15. THE term "internal staff" is defined as authenticated users with admin roles (founder, executive, manager, support agent, compliance officer) who access the system through admin.fundedwealth.com — it excludes traders, affiliates, and public visitors

### Requirement 2: Website Ownership Rules

**User Story:** As a platform architect, I want to identify features that belong to the public website, so that user-facing content is served from the correct domain.

#### Acceptance Criteria

1. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_WEBSITE when the feature renders landing pages for public visitors
2. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_WEBSITE when the feature renders marketing pages or promotional content for public visitors
3. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_WEBSITE when the feature provides a payment checkout flow for traders purchasing challenges
4. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_WEBSITE when the feature manages affiliate signup or affiliate public dashboards for affiliate partners
5. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_WEBSITE when the feature renders blog or content pages for public visitors
6. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_WEBSITE when the feature displays a public-facing dashboard showing trader statistics or leaderboards
7. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_WEBSITE when the feature renders certificates for download or display to traders

### Requirement 3: Terminal Ownership Rules

**User Story:** As a platform architect, I want to identify features that belong to the trading terminal, so that trader-facing tools are served from the correct domain.

#### Acceptance Criteria

1. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_TERMINAL when the feature renders trading charts that allow trader-initiated interactions such as drawing tools, order placement from chart, or timeframe selection
2. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_TERMINAL when the feature provides an Orders UI where traders submit, modify, or cancel their own orders, as distinguished from an admin read-only view of all orders across accounts
3. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_TERMINAL when the feature provides a Positions UI where traders view and manage their own open positions, as distinguished from an admin surveillance view of all trader positions
4. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_TERMINAL when the feature provides Watchlists for traders to create, edit, and track instrument lists for personal use
5. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_TERMINAL when the feature displays streaming or auto-refreshing market data feeds intended for trader consumption during active trading sessions
6. THE Ownership_Classifier SHALL classify a feature as MOVE_TO_TERMINAL when the feature integrates Angel One broker connectivity for trade execution on behalf of traders
7. IF a feature provides both a trader-facing interaction capability and an admin surveillance capability over the same data domain, THEN THE Ownership_Classifier SHALL apply the SPLIT classification: the trader-facing component is classified as MOVE_TO_TERMINAL and the admin read-only monitoring component is classified as KEEP

### Requirement 4: Deletion and Deprecation Rules

**User Story:** As a platform architect, I want to identify dead code and deprecated features, so that the codebase stays lean and maintainable.

#### Acceptance Criteria

1. IF a feature has zero import statements across the codebase, is not registered in any route configuration, is not rendered by any parent component, and does not fulfill any Admin_Scope operation defined in Requirement 1, THEN THE Ownership_Classifier SHALL classify that feature as DELETE
2. IF a feature provides a capability that a newer feature in the same domain also provides, and both features are currently reachable via route configuration, THEN THE Ownership_Classifier SHALL classify the older feature as DEPRECATED and document which replacement feature supersedes it
3. IF a feature provides the same user-facing capability (same input, same output, same audience) as a feature that already exists in the Website or Terminal domain, THEN THE Ownership_Classifier SHALL classify that feature as DELETE
4. IF a feature is classified as DEPRECATED, THEN THE Ownership_Classifier SHALL record the replacement feature path and the domain that owns the replacement

### Requirement 5: One Owner Principle

**User Story:** As a platform architect, I want each feature to have exactly one owner, so that there is no ambiguity about responsibility.

#### Acceptance Criteria

1. THE Ownership_Classifier SHALL assign exactly one Classification_Label to each Feature, where a Feature is defined as a distinct page route, API route, or component group that delivers a cohesive capability
2. IF a feature contains both a staff-operated capability (monitoring, approval, management, or configuration) and a capability consumed directly by traders, affiliates, or public visitors, THEN THE Ownership_Classifier SHALL split the feature into its admin-surveillance component (KEEP) and its user-facing component (MOVE_TO_WEBSITE or MOVE_TO_TERMINAL)
3. WHEN the Ownership_Classifier splits a feature, THE Ownership_Classifier SHALL assign exactly one Classification_Label to each resulting sub-feature such that no portion of the original feature remains unclassified
4. THE Ownership_Classifier SHALL document the rationale for each classification decision, including the owning domain, the primary user role served, and the Admin_Scope rule (from Requirement 1, 2, 3, or 4) that justifies the label

### Requirement 6: Admin Feature Classification — KEEP

**User Story:** As a platform architect, I want the final ownership map for features that correctly belong to admin, so that the operations team knows what stays.

#### Acceptance Criteria

1. THE Ownership_Classifier SHALL classify `/executive` (Executive Command Center) as KEEP because the feature provides founder-level operational overview for internal staff
2. THE Ownership_Classifier SHALL classify `/users` and `/users/[userId]` (User Intelligence) as KEEP because the feature provides staff-operated user management and investigation
3. THE Ownership_Classifier SHALL classify `/challenges` and `/challenges/[challengeId]` (Challenge Operations) as KEEP because the feature provides staff review, approval, pass/fail decisions on challenges
4. THE Ownership_Classifier SHALL classify `/funded` and `/funded/[accountId]` (Funded Traders) as KEEP because the feature provides staff monitoring and management of funded accounts
5. THE Ownership_Classifier SHALL classify `/payouts` and `/payouts/[payoutId]` (Payout Operations) as KEEP because the feature provides staff approval and processing of payout requests
6. THE Ownership_Classifier SHALL classify `/kyc` (KYC Verification) as KEEP because the feature provides staff approval of identity verification submissions
7. THE Ownership_Classifier SHALL classify `/risk` (Risk Management Center) as KEEP because the feature provides staff-operated risk alert triage and capital exposure monitoring
8. THE Ownership_Classifier SHALL classify `/support` (Support Operations) as KEEP because the feature provides staff management of customer support tickets
9. THE Ownership_Classifier SHALL classify `/audit` (Audit and Compliance) as KEEP because the feature provides internal audit log viewing for compliance staff
10. THE Ownership_Classifier SHALL classify `/staff` (Staff Management) as KEEP because the feature provides management of internal team members and roles
11. THE Ownership_Classifier SHALL classify `/monitoring` (System Monitoring Center) as KEEP because the feature provides operational health monitoring of infrastructure services
12. THE Ownership_Classifier SHALL classify `/revenue` (Revenue Intelligence Center) as KEEP because the feature provides internal financial analytics for business decisions
13. THE Ownership_Classifier SHALL classify `/settings` (Configuration and Rule Engine) as KEEP because the feature provides staff-operated business rule configuration
14. THE Ownership_Classifier SHALL classify `/founder/activity` (Staff Activity Feed) as KEEP because the feature provides founder visibility into all staff actions
15. THE Ownership_Classifier SHALL classify `/founder/emergency` (Emergency Controls) as KEEP because the feature provides founder-only system override controls
16. THE Ownership_Classifier SHALL classify `/founder/impersonate` (User Impersonation) as KEEP because the feature provides founder-level debugging via user session simulation
17. THE Ownership_Classifier SHALL classify `/founder/flags` (Feature Flags) as KEEP because the feature provides system-wide feature toggle management
18. THE Ownership_Classifier SHALL classify `/founder/notifications` (System Notifications) as KEEP because the feature provides staff-level notification management
19. THE Ownership_Classifier SHALL classify `/founder/exports` (Data Exports) as KEEP because the feature provides staff-operated data export capabilities
20. THE Ownership_Classifier SHALL classify `/(auth)/login`, `/(auth)/2fa`, `/(auth)/2fa-setup` (Staff Authentication) as KEEP because the feature provides staff-only login with 2FA security
21. THE Ownership_Classifier SHALL treat route paths as logical Next.js App Router paths where route group prefixes such as `(dashboard)` and `(auth)` are structural groupings and do not alter the classified route identity
22. IF a route listed in criteria 1–20 does not exist in the current codebase, THEN THE Ownership_Classifier SHALL flag that route as KEEP_EXPECTED_MISSING and include it in the ownership map with a note that the route is defined in requirements but absent from the implementation
23. IF a route exists in the admin codebase under Admin_Scope (as defined in Requirement 1) and is not listed in criteria 1–20 or in any other requirement's classification criteria, THEN THE Ownership_Classifier SHALL flag that route as UNCLASSIFIED for manual review

### Requirement 7: Features to Move to Website

**User Story:** As a platform architect, I want the final ownership map for features that should move to fundedwealth.com, so that the migration plan is clear.

#### Acceptance Criteria

1. THE Ownership_Classifier SHALL classify `/certificates` (Certificate Center) as SPLIT: the admin-retained component is a read-only certificate audit view (listing issued certificates, filtering by type/date, viewing certificate metadata) classified as KEEP; the trader-facing component (certificate generation trigger, certificate download, certificate display/sharing page) is classified as MOVE_TO_WEBSITE because traders are the primary audience for downloading and displaying their achievement certificates
2. THE Ownership_Classifier SHALL classify `/marketing` (Marketing Operations Center — Promotions, Coupons, Announcements) as SPLIT: the admin-retained component is the campaign management UI (creating promotions, configuring discount rules, generating coupon codes, drafting announcements, viewing campaign analytics) classified as KEEP; the public-facing component (coupon redemption pages where traders apply codes, announcement display pages where traders read notifications, promotional landing pages) is classified as MOVE_TO_WEBSITE
3. IF the `/certificates` route in the current codebase contains only admin-operated functionality (listing, filtering, metadata viewing) with no trader-facing download or display capability, THEN THE Ownership_Classifier SHALL classify the existing route as KEEP and note that the trader-facing certificate component does not yet exist in this codebase

### Requirement 8: Features to Move to Terminal

**User Story:** As a platform architect, I want the final ownership map for features that should move to terminal.fundedwealth.com, so that trader tools are correctly scoped.

#### Acceptance Criteria

1. THE Ownership_Classifier SHALL classify `/trades` (Trade Surveillance Center) as SPLIT where the KEEP portion includes the read-only admin surveillance view that displays all-account trade data in a filterable table with export capability and no create, modify, or close-trade actions, and the MOVE_TO_TERMINAL portion includes any UI that allows a trader to place a new trade, modify an open position, close a position, or view only their own personal trade history scoped to a single trader account
2. THE Ownership_Classifier SHALL classify `/orders` (Order Monitoring Center) as SPLIT where the KEEP portion includes the read-only admin order monitoring view that displays all-account order data with rejection-reason investigation and no order-write actions, and the MOVE_TO_TERMINAL portion includes any UI that allows a trader to submit a new order, cancel a pending order, modify order parameters, or view only their own personal order history scoped to a single trader account
3. THE Ownership_Classifier SHALL distinguish KEEP from MOVE_TO_TERMINAL by applying this rule: views that are read-only, span all accounts, and serve admin oversight remain as KEEP; views that perform write operations (create, modify, cancel, close) on trades or orders, or that are scoped to a single trader's own account for self-service use, are classified as MOVE_TO_TERMINAL

### Requirement 9: Features Requiring Special Attention

**User Story:** As a platform architect, I want clear decisions on ambiguous features, so that nothing falls through the cracks.

#### Acceptance Criteria

1. THE Ownership_Classifier SHALL classify `/affiliates` (Affiliate Operations Center) as a SPLIT: the admin affiliate management — defined as affiliate listing with status filtering, commission tracking (earned, pending, paid), referral counts, revenue generated per affiliate, export functionality, and status management (active, suspended, terminated) — stays as KEEP; any affiliate signup portal (public-facing registration form for new affiliates) or affiliate self-service dashboard (affiliate-facing views of their own referrals and earnings) belongs to the Website
2. THE Ownership_Classifier SHALL confirm that no landing pages, blog pages, or public marketing pages exist in the current admin codebase by verifying that no route serves publicly-accessible content without admin authentication — classification NOT_FOUND (no action required); the `/marketing` route (promotions, coupons, announcements) is internal admin tooling and does not constitute a public marketing page
3. THE Ownership_Classifier SHALL confirm that no payment checkout flow (customer-facing payment form, cart, or purchase initiation UI) exists in the current admin codebase — classification NOT_FOUND (no action required); the `/payouts` route (admin payout lifecycle management including approve, reject, and batch processing) and `/orders` route (trade order monitoring) are internal admin operations and do not constitute a checkout flow
4. THE Ownership_Classifier SHALL confirm that no interactive trading charts (real-time candlestick or line charts with user-controlled timeframes), positions UI (user's open position management with close/modify actions), watchlists (user-curated symbol lists), or market data feeds (streaming price tickers for end-user consumption) exist in the current admin codebase — classification NOT_FOUND (no action required); the `/trades` route (Trade Surveillance Center for read-only admin monitoring of executed trades) is admin oversight and does not constitute a user-facing trading interface
5. THE Ownership_Classifier SHALL confirm that no Angel One integration UI (broker connection screens, account linking flows, or Angel One API configuration exposed to end-users) exists in the current admin codebase — classification NOT_FOUND (no action required)
6. THE Ownership_Classifier SHALL confirm that no public dashboard (unauthenticated performance metrics visible to visitors) or leaderboard (publicly-ranked trader comparison page) exists in the current admin codebase — classification NOT_FOUND (no action required)
7. IF any route or component matching a NOT_FOUND feature category (landing pages, checkout flow, interactive trading UI, Angel One integration UI, public dashboard, or leaderboard) is discovered during codebase scanning, THEN THE Ownership_Classifier SHALL reclassify that feature as MIGRATE and assign it to the appropriate domain (Website or Terminal)

### Requirement 10: Final Ownership Map Summary

**User Story:** As a platform architect, I want a consolidated ownership map, so that all stakeholders have a single reference document.

#### Acceptance Criteria

1. THE Ownership_Classifier SHALL produce a final ownership map containing every route path under `src/app`, every API endpoint under `src/app/api`, and every shared component group under `src/components`, verified by cross-referencing the project's file-system directory tree so that no discovered path is omitted from the map
2. THE Ownership_Classifier SHALL organize the ownership map into six sections: KEEP (Admin), MOVE_TO_WEBSITE, MOVE_TO_TERMINAL, DELETE (including DEPRECATED items pending removal), NOT_FOUND (features expected but not present), and SPLIT (features with dual ownership where admin retains one component and another domain receives the other)
3. THE Ownership_Classifier SHALL include for each classified feature: the route path, the feature name, the Classification_Label, and a rationale of no more than 120 characters explaining the ownership decision
4. WHEN the final ownership map is produced, THE Ownership_Classifier SHALL mark each SPLIT feature with a dedicated SPLIT annotation that identifies the admin-retained component name and its classification, and the user-facing component name and its target domain (MOVE_TO_WEBSITE or MOVE_TO_TERMINAL)
5. IF a route, API endpoint, or component group discovered in the file system does not appear in the final ownership map, THEN THE Ownership_Classifier SHALL report it as an UNCLASSIFIED entry requiring manual review
