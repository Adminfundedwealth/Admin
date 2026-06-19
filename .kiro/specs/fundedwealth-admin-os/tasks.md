# Implementation Plan: FundedWealth Admin OS

## Overview

This implementation plan covers the complete build-out of the FundedWealth Admin OS — an enterprise-grade internal operating system for managing the entire prop trading firm. The plan is organized into 42 tasks covering: project setup, database schema, core libraries (RBAC, audit, sessions, notifications, rate limiting), middleware, authentication UI, dashboard layout, all 18 operating centers, real-time subscriptions, exports, cron jobs, accessibility, and security hardening.

## Tasks

- [x] 1. Project Initialization and Configuration: Initialize Next.js 14+ with App Router, TypeScript strict mode, Tailwind CSS, and shadcn/ui. Configure Supabase clients (browser, server, admin). Set up design tokens, theme providers, environment variables, and security headers in next.config.ts.
  - Requirements: 24 (AC 1, 2), 25 (AC 1, 4)

- [x] 2. Database Schema - Authentication and Authorization Tables: Create staff_members, roles, role_permissions, staff_role_assignments, staff_sessions, login_history, and staff_devices tables with all indexes. Seed 10 default system roles with permissions matching the Permission Matrix.
  - Requirements: 1 (AC 1, 6), 2 (AC 2, 3, 4)

- [x] 3. Database Schema - Audit System: Create audit_records table (partitioned by month) with immutability triggers preventing UPDATE/DELETE. Create notifications table with unread index. Set up all audit indexes.
  - Requirements: 3 (AC 1, 2, 3, 4, 5, 6)

- [x] 4. Database Schema - User and Trading Domain: Create users (with full-text search vector and GIN index), challenge_accounts, funded_accounts, trades, and orders tables with all indexes and constraints.
  - Requirements: 5 (AC 1), 6 (AC 1), 7 (AC 1), 11 (AC 1, 7), 12 (AC 1), 22 (AC 1, 2)

- [x] 5. Database Schema - Payouts, KYC, and Risk: Create payout_requests, payout_status_history (append-only), kyc_submissions, kyc_documents, and risk_alerts tables with all indexes and constraints.
  - Requirements: 8 (AC 1, 2, 7), 9 (AC 1, 2), 10 (AC 1, 2)

- [x] 6. Database Schema - Affiliates, Support, Marketing, Config, and Certificates: Create commission_structures, affiliates, referrals, commissions, support_tickets, ticket_messages, promotions, coupon_codes, announcements, configurations, certificates, system_health_checks, background_jobs, and data_exports tables with all indexes.
  - Requirements: 13 (AC 1, 3), 15 (AC 1), 16 (AC 1, 3), 17 (AC 1, 2, 3), 18 (AC 1, 5), 20 (AC 1, 7), 23 (AC 2, 6)

- [x] 7. Database Schema - Row Level Security Policies: Enable RLS on all data tables. Create permission-based SELECT policies for each resource. Create INSERT-only policy for audit_records. Ensure RBAC is enforced at the database level.
  - Requirements: 2 (AC 1), 24 (AC 3)

- [x] 8. Core Library - Session Manager: Implement lib/session/ with types, manager (create/validate/refresh/invalidate/invalidateAll/getActiveSessions), and validator (idle timeout 30min, max age 8hr). Implement device fingerprint detection for new device alerts.
  - Requirements: 1 (AC 1, 3, 5), 19 (AC 4, 6)

- [x] 9. Core Library - RBAC Engine: Implement lib/rbac/ with permission types, default role mappings, engine (hasPermission/hasAnyPermission/getStaffPermissions with 5s cache TTL), Founder/Co-Founder bypass, multiple role union logic, and middleware integration.
  - Requirements: 2 (AC 1, 3, 4, 7, 8)

- [x] 10. Core Library - Audit Logger: Implement lib/audit/ with types, logger (log/logBatch/query), automatic field population (UTC ms timestamp, actor role, IP/device from request), query filtering/pagination (100/page reverse chrono), and denied-attempt logging.
  - Requirements: 3 (AC 1, 3, 5, 6)

- [x] 11. Core Library - Notification Engine and Rate Limiter: Implement lib/notifications/ (send/broadcast by permission/markRead/getUnread) with Supabase Realtime delivery within 5s. Implement lib/rate-limit/ with token bucket algorithm (100 read/min, 30 write/min) and rate limit headers.
  - Requirements: 21 (AC 1, 2, 4), 24 (AC 4, 5)

- [x] 12. Next.js Middleware - Authentication, Authorization, and Rate Limiting: Create middleware.ts implementing session validation (idle/max age), rate limiting (429 with retryAfter), route permission checking (403 + audit log), and session activity touch. Configure matcher to exclude auth routes.
  - Requirements: 1 (AC 3), 2 (AC 1, 6), 24 (AC 4, 5)

- [x] 13. Authentication Module - Login, 2FA, and Session UI: Create auth layout, login page (email/password), 2FA verification page (60s code window, 3 failures → 15min lock), 2FA setup page (first-login enrollment), new device detection with email alert, logout action, and account lockout (5 failures → 30min lock + Founder notification).
  - Requirements: 1 (AC 1, 2, 4, 5, 7, 8), 19 (AC 5)

- [x] 14. Dashboard Layout - Sidebar, Header, and Navigation: Create authenticated layout with sidebar (8 sections, 18 centers, permission-gated, badge counts updated every 60s), header (staff info, notification bell, theme toggle, logout), notification center dropdown, and dark/light mode with system preference detection and persistence.
  - Requirements: 22 (AC 3, 4, 5), 21 (AC 2), 25 (AC 4)

- [x] 15. Global Search - Command Palette: Create Ctrl+K command palette using shadcn/ui Command component. Implement search API (min 2 chars, PostgreSQL full-text + ILIKE, grouped by entity type, max 5 per group, "view all" option, permission-filtered, results within 2 seconds, empty state).
  - Requirements: 22 (AC 1, 2, 3, 5)

- [x] 16. Shared UI Components: Create data-table (pagination, sorting, selection), filters (composable, AND logic), loading-state (skeleton after 300ms), error-state (retry action), empty-state (descriptive message), timeline (reverse chrono, 50 default, load more), audit-trail, export-button (sync ≤10k, async >10k), badge-count, and chart components (line, bar, pie, funnel using recharts).
  - Requirements: 25 (AC 1, 2, 3, 5, 6, 7), 23 (AC 1, 2)

- [x] 17. Executive Command Center: Create executive dashboard page with 8 KPI cards (active users, challenges, funded accounts, revenue by period, pending payouts/KYC/tickets, risk alerts), live activity feed (20 events, 5s real-time updates), operational alerts (threshold-based, severity levels), revenue/conversion/pass-rate charts (1-365 day range), risk alert passthrough (5s), and staleness indicators for unavailable data sources.
  - Requirements: 4 (AC 1, 2, 3, 4, 5, 6)

- [x] 18. User Intelligence Center - List and Search: Create users list page with paginated data table, advanced filtering (KYC status, account status, date range, country), search (email/username/ID/phone/account number, partial match ≥3 chars, ≤3s), bulk operations (max 100, permission-validated), and empty/error states.
  - Requirements: 5 (AC 1, 2, 7, 8)

- [x] 19. User Intelligence Center - Profile Detail: Create user profile page displaying all associated data (personal info, KYC, purchases, challenges, funded accounts, trades summary, payouts, referrals, tickets, login history, devices, notes), event timeline (reverse chrono, 50 default, load more), internal notes (10-5000 chars, with author/timestamp/category), and user actions (ban/suspend/modify requiring 10+ char reason, audit record creation).
  - Requirements: 5 (AC 3, 4, 5, 6)

- [x] 20. Challenge Operations Center: Create challenge list page (paginated 20/page, filtered by status/type/date/user), pass confirmation details, action buttons (pass/fail/retry/reset/extend/upgrade/archive/restore with 10+ char reason, 20+ for manual pass/fail), timeline history (state changes, trade summaries, staff interactions), state machine validation (reject invalid transitions with error), reset logic (preserve history, new period), and challenges.manage permission enforcement.
  - Requirements: 6 (AC 1, 2, 3, 4, 5, 6, 7, 8)

- [x] 21. Funded Trader Center: Create funded accounts list (equity, P&L, drawdown % of max, violations, eligibility), drawdown breach detection with immediate visual flag and Risk_Management_Center notification (5s), profit share calculator (trader's share + firm's share), eligibility confirmation (all criteria listed), performance dashboard (equity curve, 30-day P&L, trade stats, rule compliance), and account modification with audit trail.
  - Requirements: 7 (AC 1, 2, 3, 4, 5, 6)

- [x] 22. Payout Operations Center: Create payout list with analytics (total paid daily/weekly/monthly, pending, avg processing time, rejection rate), detail page with trader/account/eligibility info, multi-step workflow UI (6 statuses with transitions), approve action (payouts.approve permission, audit), reject action (10-1000 char reason, trader notification, audit), failed payment handling (retry/cancel), permission denial logging, and append-only history enforcement.
  - Requirements: 8 (AC 1, 2, 3, 4, 5, 6, 7, 8)

- [x] 23. KYC Verification Center: Create KYC queue page with tabs (pending/overdue/all), analytics (submissions/day, avg review time, approval rate, rejection breakdown, queue depth), document viewer (5 document types), review actions (approve/reject with predefined reasons/resubmit with instructions), concurrent review detection, status updates with audit records, 3-resubmission limit with escalation, and 48-hour overdue detection with team lead notification.
  - Requirements: 9 (AC 1, 2, 3, 4, 5, 6, 7, 8)

- [x] 24. Risk Management Center: Create risk dashboard (accounts at risk, breach trends, top 10 rules, capital exposure), alert list (severity-sorted, filterable), alert detail with resolution workflow (acknowledge/resolve with outcome selector), anomaly detection service (configurable thresholds: position sizes, trade frequency, correlating accounts, prohibited strategies), 15-minute auto-escalation (severity increase + re-notification), and critical/high alert notifications to risk.manage staff within 30s.
  - Requirements: 10 (AC 1, 2, 3, 4, 5, 6, 7)

- [x] 25. Trade Surveillance Center: Create trade table (paginated 50/100/200 rows, 11 columns), advanced filters (8 filter types, AND logic), account detail panel (positions, history, performance stats with profit factor), aggregate statistics (total trades, win rate, avg profit/loss, top 5 symbols/hours), CSV export (max 50k rows), empty state (preserve filters), and 3-second query performance for 30-day spans.
  - Requirements: 11 (AC 1, 2, 3, 4, 5, 6, 7)

- [x] 26. Order Monitoring Center: Create order table (paginated 50/page, 10 columns, sorted by submission desc), filters (status/account/symbol/type/date, default today, max 90 days), rejected order highlighting with persistent indicator and acknowledgment, execution analytics (fill rate, avg fill time, rejection/cancellation rates for today/7d/30d), and empty state.
  - Requirements: 12 (AC 1, 2, 3, 4, 5, 6)

- [x] 27. Affiliate Operations Center: Create affiliate list (profile, code, financials, status), referral analytics (conversion rate, revenue by affiliate, top 10, commission trends), commission calculator (flat/percentage/tiered/recurring), payout review workflow (require affiliates.manage, audit, notify), commission reversal on refund (reverse from pending, audit record), commission calculation within 60s of purchase, and affiliate modification with audit trail.
  - Requirements: 13 (AC 1, 2, 3, 4, 5, 6, 7, 8)

- [x] 28. Revenue Intelligence Center: Create revenue dashboard with metrics (total revenue, by type/period, AOV, CLV), conversion analytics (funnel with drop-off % per stage), sales analytics (volume, by type/country, refund/chargeback rates), date range picker (default: current month, recalculate within 5s), CSV/PDF export of displayed metrics, and error state for unavailable data sources (message + last load timestamp).
  - Requirements: 14 (AC 1, 2, 3, 4, 5, 6, 7)

- [x] 29. Support Operations Center: Create ticket list (paginated 20/page, priority/status/agent/timestamps), resolution metrics (avg response/resolution time, tickets/agent, satisfaction 1-5, resolution rate by category for today/7d/30d), ticket detail (conversation history, trader summary, 10 related tickets), escalation (10+ char reason, team assignment, notification), resolve action (timestamp, resolution time calc), and SLA breach detection (per priority threshold, visual indicator, team lead notification).
  - Requirements: 15 (AC 1, 2, 3, 4, 5, 6, 7)

- [x] 30. Marketing Operations Center: Create promotions management (name/description/discount config/dates/limits/status with validation bounds), coupons (unique 4-32 char code, discount, validity, limits), announcements (title 150/content 5000/audience/period/priority), campaign analytics (usage, revenue, conversion rate), auto-expiry on end date, validation (reject duplicates/out-of-bounds values), and audit records for all changes.
  - Requirements: 16 (AC 1, 2, 3, 4, 5, 6, 7)

- [x] 31. Certificate Center: Create certificate list (filterable by type/trader/date, showing ID/name/type/date/status), manual generation with eligibility validation (passed challenge or funded account required), PDF generation (unique ID, trader name, achievement details), storage in Supabase Storage, download capability, revocation with required reason, and eligibility failure error messages.
  - Requirements: 17 (AC 1, 2, 3, 4, 5, 6)

- [x] 32. System Monitoring Center: Create service health display (API/DB/WebSocket/email/payment/jobs with healthy/degraded/down states, refreshed every 30s), performance metrics (API p50/p95/p99, DB avg/p95, WebSocket count, job completion rate over 24hr), service dependency map, failed jobs queue (name/error/timestamp/attempts, retry max 3, permanently_failed after exhaustion with alert), and alert generation within 60s of state change.
  - Requirements: 18 (AC 1, 2, 3, 4, 5, 6, 7)

- [x] 33. Audit & Compliance Center: Create audit log viewer (paginated 100/page, reverse chrono), filters (actor/action/target entity/date range/IP), detail view (previous/new state JSON diff, device info, batch grouping), and immutability visual indicators. Enforce audit.view permission.
  - Requirements: 3 (AC 3, 4, 5, 6)

- [x] 34. Staff Management Center: Create staff list and detail pages, create-staff form (email unique/name 1-100/role/temp password 12+ chars with 24hr expiry), session manager (view active sessions, selective revocation), permission audit log (365-day retention, 50/page), disable staff action (invalidate all sessions within 5s), 2FA enforcement on first login, and duplicate email rejection.
  - Requirements: 19 (AC 1, 2, 3, 4, 5, 6, 7)

- [x] 35. Configuration and Rule Engine: Create settings hub with sub-pages for challenge rules (profit targets/drawdowns/trading days/prohibited strategies with min/max bounds), payout rules (min amount/frequency/split 0-100%/timeframes), affiliate rules (rates/thresholds/tiers), and notification templates. Implement version history (50 versions/category), revert with confirmation prompt, validation against business constraints (reject with specific error), and audit records for all changes.
  - Requirements: 20 (AC 1, 2, 3, 4, 5, 6, 7, 8)

- [x] 36. Data Export System: Implement CSV generator (streaming, respects filters/sort), async export for >10k records (background job, Supabase Storage upload, 24hr download availability, notification on completion), export API (permission checks, max 500k records), download endpoint (signed URL), failure handling (error notification + retry), and audit record for every export. Add export buttons to all tabular operating centers.
  - Requirements: 23 (AC 1, 2, 3, 4, 5, 6)

- [x] 37. Real-Time Subscriptions and Live Updates: Create generic useRealtime hook wrapping Supabase Realtime with auto-reconnection. Create useNotifications hook (staff-specific channel, 5s delivery). Implement live data table updates (5s without refresh), connection status indicator (reconnecting state, missed notification delivery on reconnect), useSession/usePermissions hooks, configurable notification preferences per staff, and Realtime channels for risk/payouts/KYC/system/activity.
  - Requirements: 21 (AC 1, 2, 3, 4, 5), 4 (AC 2, 5)

- [x] 38. Role Management UI: Create role list (system + custom with permission/staff counts), role editor (permission selector for all 30 permissions, name 3-50 chars), custom role creation (max 50 enforcement), permission modification (immediate enforcement within 5s for all assigned staff), role deletion (terminate sessions within 5s, require re-auth), multiple role assignment (union), and audit records for all role changes.
  - Requirements: 2 (AC 5, 7, 8, 9)

- [x] 39. Cron Jobs and Background Processes: Configure Vercel Cron for: health checks (30s), KYC overdue (hourly), risk escalation (1min), promotion expiry (hourly), session cleanup (15min), badge refresh (60s), analytics materialization (5min), export cleanup (daily), and login history cleanup (daily, remove >90 days).
  - Requirements: 9 (AC 7), 10 (AC 7), 16 (AC 2), 1 (AC 6), 22 (AC 4)

- [x] 40. Optimistic UI Updates and Error Recovery: Implement optimistic update pattern for all mutations (immediate UI update, revert within 2s on server rejection with error message). Implement loading skeleton (after 300ms), error state (with retry), empty state (descriptive message), form validation (Zod inline errors), error toasts, and graceful degradation (queue payouts if payment down, queue notifications if email down, staleness indicator if trading API down).
  - Requirements: 24 (AC 5, 6, 7), 25 (AC 5, 6, 7)

- [x] 41. Accessibility and Responsive Design: Implement WCAG 2.1 AA compliance with full keyboard navigation, ARIA labels/roles/live regions, color contrast (4.5:1 normal text, 3:1 large/interactive), responsive layouts 1280-2560px (no overflow/scrolling/breakage), screen reader support for dynamic content (notifications, live feed, table updates), focus management (modals, command palette, workflows), and skip navigation links with landmarks.
  - Requirements: 25 (AC 2, 3)

- [x] 42. Security Hardening: Configure CSP headers, CSRF protection (SameSite + origin check), input sanitization for rich text, secure cookies (HttpOnly/Secure/SameSite=Strict), bcrypt password hashing, AES-256 TOTP secret encryption, security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy), request body size limits, and Zod validation on all API route handlers.
  - Requirements: 1 (AC 2), 24 (AC 3)

## Task Dependency Graph

```json
{
  "waves": [
    [1],
    [2, 3, 4, 5, 6],
    [7, 8, 9, 10, 11],
    [12, 42],
    [13],
    [14, 15, 16],
    [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
    [39, 40, 41]
  ]
}
```

## Notes

- Tasks 1-7 form the foundation layer and must be completed before any feature modules
- Tasks 8-12 are core libraries that enable the middleware and all operating centers
- Tasks 13-16 establish the authentication UI, layout shell, search, and shared components
- Tasks 17-35 are the 18 operating centers plus staff/config management — can be parallelized after dependencies are met
- Tasks 36-42 are cross-cutting concerns (exports, realtime, roles, crons, accessibility, security) that enhance all modules
- Each operating center module follows the same internal structure: page → components → hooks → actions → services → repositories
- All state-changing operations create audit records via the shared Audit Logger
- All API endpoints enforce RBAC via the middleware stack
- Real-time updates via Supabase Realtime apply to all data tables and dashboards
