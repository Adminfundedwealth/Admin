# FundedWealth Admin OS — Full Ownership & Duplication Audit

**Generated:** June 23, 2026  
**Project:** `fundedwealth-admin-os` v0.1.0  
**Stack:** Next.js 14.2.21 / Supabase / TypeScript / TailwindCSS

---

## 1. WEBSITE OWNERSHIP AUDIT (Frontend / Pages)

| Page Route | Feature | Owner Domain | Supabase Tables Used |
|---|---|---|---|
| `/executive` | Executive Command Center | Founder | payout_requests, kyc_submissions, support_tickets, risk_alerts, funded_accounts, staff_sessions, users, challenge_accounts |
| `/users` | User Intelligence (list) | User Operations | users |
| `/users/[userId]` | User Detail | User Operations | users, challenge_accounts, funded_accounts, payout_requests |
| `/challenges` | Challenge Operations (list) | User Operations | challenge_accounts |
| `/challenges/[id]` | Challenge Detail | User Operations | challenge_accounts, trades |
| `/funded` | Funded Traders (list) | User Operations | funded_accounts |
| `/funded/[accountId]` | Funded Account Detail | User Operations | funded_accounts, trades, risk_alerts |
| `/payouts` | Payout Operations (list) | Finance | payout_requests |
| `/payouts/[payoutId]` | Payout Detail | Finance | payout_requests, funded_accounts |
| `/revenue` | Revenue Intelligence | Finance | payout_requests (orders) |
| `/kyc` | KYC Verification | Compliance | kyc_submissions |
| `/risk` | Risk Management | Compliance | risk_alerts |
| `/audit` | Audit & Compliance | Compliance | audit_records |
| `/trades` | Trade Surveillance | Trading | trades |
| `/orders` | Order Monitoring | Trading | orders |
| `/affiliates` | Affiliate Operations | Growth | affiliates |
| `/marketing` | Marketing Operations | Growth | promotions, coupon_codes |
| `/support` | Support Operations | Support | support_tickets |
| `/certificates` | Certificate Center | Support | certificates |
| `/monitoring` | System Monitoring | System | system_health_checks |
| `/staff` | Staff Management | System | staff_members, roles, staff_role_assignments |
| `/settings` | Configuration | System | app_config |
| `/founder/activity` | Staff Activity | Founder-only | audit_records, staff_sessions |
| `/founder/emergency` | Emergency Controls | Founder-only | staff_sessions, funded_accounts |
| `/founder/exports` | Data Exports | Founder-only | data_exports |
| `/founder/flags` | Feature Flags | Founder-only | feature_flags |
| `/founder/impersonate` | Impersonation | Founder-only | staff_members |
| `/founder/notifications` | Notification Management | Founder-only | notifications |

---

## 2. TERMINAL OWNERSHIP AUDIT (API Routes / Backend)

| API Endpoint | Method | Feature | Tables Accessed |
|---|---|---|---|
| `/api/auth/login` | POST | Staff authentication | staff_members, login_history, staff_sessions |
| `/api/auth/logout` | POST | Session invalidation | staff_sessions |
| `/api/auth/2fa/verify` | POST | TOTP verification | staff_members, staff_sessions |
| `/api/users` | GET | User list/search | users |
| `/api/users/[id]` | GET | User detail | users |
| `/api/users/[id]/notes` | GET/POST | User notes | user_notes |
| `/api/challenges` | GET | Challenge list | challenge_accounts |
| `/api/challenges/[id]` | GET | Challenge detail | challenge_accounts |
| `/api/challenges/[id]/[action]` | POST | Challenge actions | challenge_accounts |
| `/api/funded` | GET | Funded account list | funded_accounts |
| `/api/funded/[id]` | GET | Funded detail | funded_accounts |
| `/api/payouts` | GET | Payout list + analytics | payout_requests |
| `/api/payouts/[id]` | GET | Payout detail | payout_requests |
| `/api/payouts/[id]/[action]` | POST | Approve/reject payout | payout_requests |
| `/api/kyc` | GET | KYC submissions list | kyc_submissions |
| `/api/risk` | GET | Risk alerts list | risk_alerts |
| `/api/risk/exposure` | GET | Capital exposure | funded_accounts, risk_alerts |
| `/api/risk/heatmap` | GET | Risk heatmap | risk_alerts |
| `/api/trades` | GET | Trades list | trades |
| `/api/orders` | GET | Orders list | orders |
| `/api/affiliates` | GET | Affiliates list | affiliates |
| `/api/support` | GET | Support tickets list | support_tickets |
| `/api/certificates` | GET | Certificates list | certificates |
| `/api/audit` | GET | Audit records list | audit_records |
| `/api/staff` | GET | Staff members list | staff_members |
| `/api/staff/presence` | GET | Online staff | staff_sessions, staff_members, staff_role_assignments |
| `/api/roles` | GET/POST | Roles CRUD | roles, role_permissions |
| `/api/monitoring/health` | GET | System health records | system_health_checks |
| `/api/executive/metrics` | GET | KPI dashboard data | users, challenge_accounts, funded_accounts, payout_requests, kyc_submissions, support_tickets, risk_alerts, staff_sessions |
| `/api/executive/revenue` | GET | Revenue trend chart | (placeholder) |
| `/api/executive/alerts` | GET | Operational alerts | (placeholder) |
| `/api/executive/queues` | GET | Queue counts | payout_requests, kyc_submissions, support_tickets, risk_alerts |
| `/api/executive/risk-health` | GET | Risk health summary | risk_alerts, funded_accounts |
| `/api/executive/system-health` | GET | Service status | staff_members (db check) |
| `/api/executive/activity` | GET | Activity feed (audit) | audit_records |
| `/api/feed` | GET | Operations feed (24h) | users, payout_requests, kyc_submissions, risk_alerts, support_tickets |
| `/api/search` | GET | Global search | users, challenge_accounts, funded_accounts, support_tickets, affiliates |
| `/api/export` | POST | Data export | audit_records, data_exports |
| `/api/copilot/query` | POST | AI operations copilot | payout_requests, kyc_submissions, risk_alerts, support_tickets, orders, funded_accounts, staff_sessions, audit_records |
| `/api/cron/session-cleanup` | GET | Expired session purge | staff_sessions |
| `/api/cron/risk-escalation` | GET | Auto-escalate alerts | risk_alerts |
| `/api/cron/health-check` | GET | Service health ping | system_health_checks |
| `/api/cron/kyc-overdue` | GET | Mark overdue KYC | kyc_submissions |
| `/api/cron/login-history-cleanup` | GET | Purge old logins | login_history |
| `/api/cron/promotion-expiry` | GET | Expire promotions | promotions, coupon_codes |
| `/api/cron/export-cleanup` | GET | Mark expired exports | data_exports |

---

## 3. COMPARE REPORTS — Identifying Overlaps

### Observations:

The website (pages) fetches data exclusively through the API routes. There is **no server-side data fetching directly in pages** — all pages are `'use client'` components calling `/api/*` endpoints. This is a clean separation.

However, there are duplication issues in the **backend/lib layer** and within **API endpoints themselves**.

---

## 4. DUPLICATE FEATURE MAP

| Duplicate Feature | Location A | Location B | Issue |
|---|---|---|---|
| **Rate Limiting** | `src/middleware.ts` (inline implementation) | `src/lib/rate-limit/limiter.ts` (standalone module) | Two completely separate rate limiting implementations. Middleware has its own inline token bucket. The lib module is never used by middleware. |
| **RBAC Permission Checking** | `src/middleware.ts` (inline permission query) | `src/lib/rbac/engine.ts` + `src/lib/rbac/middleware.ts` | Middleware does its own Supabase query for permissions instead of using the RBACEngine singleton. The rbac/middleware.ts helper is never called from the actual Next.js middleware. |
| **Route Permission Mapping** | `src/middleware.ts` (ROUTE_PERMISSIONS + API_PERMISSIONS inline) | `src/config/permissions.ts` (ROUTE_PERMISSIONS) | Same route→permission map defined in two places. Config version is canonical but middleware duplicates it. |
| **Session Validation** | `src/middleware.ts` (inline supabase.auth.getUser) | `src/lib/session/manager.ts` (SessionManager class) | Middleware uses Supabase Auth session while SessionManager uses custom token_hash-based sessions. Two competing auth systems. |
| **Supabase Client in Middleware** | `src/middleware.ts` (inline createServerClient) | `src/lib/supabase/middleware.ts` (updateSession helper) | Middleware creates its own Supabase client instead of using the provided `updateSession` utility. |
| **Operations Feed / Activity** | `/api/feed` (24h operations feed from multiple tables) | `/api/executive/activity` (recent events from audit_records) | Both provide a "recent activity" feed. Feed pulls from 5 tables independently; Activity pulls from audit_records. Overlapping purpose. |
| **Audit Logging** | `src/lib/audit/logger.ts` (AuditLogger class) | `/api/export/route.ts` (direct insert into audit_records) | Export route bypasses AuditLogger and does a raw insert. |
| **Copilot Data Queries** | `/api/copilot/query` (queries payout_requests, risk_alerts, etc.) | Individual domain APIs (`/api/payouts`, `/api/risk`, etc.) | Copilot re-implements simplified versions of the same queries that domain APIs already handle. |
| **System Health Check** | `/api/executive/system-health` (checks DB, services) | `/api/monitoring/health` (reads system_health_checks table) | Two health endpoints: one does live checks, the other reads stored results from the cron job. |

---

## 5. DUPLICATE TABLE MAP

| Table | Accessed From (Duplicated Queries) | Issue |
|---|---|---|
| `payout_requests` | `/api/payouts`, `/api/executive/metrics`, `/api/executive/queues`, `/api/feed`, `/api/copilot/query` | 5 separate API routes query this table with overlapping filters. Executive metrics calculates analytics that /api/payouts also calculates. |
| `risk_alerts` | `/api/risk`, `/api/executive/metrics`, `/api/executive/queues`, `/api/executive/risk-health`, `/api/feed`, `/api/copilot/query` | 6 routes query the same table. Risk-health and metrics both count open alerts. |
| `kyc_submissions` | `/api/kyc`, `/api/executive/metrics`, `/api/executive/queues`, `/api/feed`, `/api/copilot/query` | 5 routes. Metrics and queues both count pending KYC. |
| `support_tickets` | `/api/support`, `/api/executive/metrics`, `/api/executive/queues`, `/api/feed`, `/api/copilot/query` | 5 routes. Same "count open tickets" repeated. |
| `staff_sessions` | `/api/staff/presence`, `/api/executive/metrics`, `src/middleware.ts`, `src/lib/session/manager.ts`, `/api/auth/login`, `/api/auth/logout`, `/api/cron/session-cleanup` | 7 access points. Custom session system vs Supabase Auth session (two paradigms). |
| `users` | `/api/users`, `/api/executive/metrics`, `/api/feed`, `/api/search`, `/api/copilot/query` | 5 routes query users. Feed and search both search by email/name. |
| `audit_records` | `/api/audit`, `/api/executive/activity`, `/api/export`, `src/lib/audit/logger.ts`, `/api/copilot/query` | 5 access points. Activity and audit both query the same table for recent actions. |
| `funded_accounts` | `/api/funded`, `/api/executive/metrics`, `/api/executive/risk-health`, `/api/risk/exposure`, `/api/copilot/query` | 5 routes. Risk-health and exposure both calculate capital at risk from this table. |
| `challenge_accounts` | `/api/challenges`, `/api/executive/metrics`, `/api/search` | 3 routes. Metrics re-queries pass/fail rates. |
| `staff_members` | `/api/staff`, `/api/staff/presence`, `/api/auth/login`, `/api/executive/system-health` | 4 routes. |

---

## 6. DUPLICATE API MAP

| API Query Pattern | Duplicated In | Recommendation |
|---|---|---|
| Count pending payouts | `/api/payouts` (analytics), `/api/executive/metrics`, `/api/executive/queues`, `/api/copilot/query` | Create shared `getPayoutStats()` utility in `lib/` |
| Count open risk alerts | `/api/risk`, `/api/executive/metrics`, `/api/executive/queues`, `/api/executive/risk-health`, `/api/copilot/query` | Create shared `getRiskSummary()` utility |
| Count pending KYC | `/api/kyc`, `/api/executive/metrics`, `/api/executive/queues`, `/api/copilot/query` | Create shared `getKYCStats()` utility |
| Count open tickets | `/api/support`, `/api/executive/metrics`, `/api/executive/queues`, `/api/copilot/query` | Create shared `getTicketStats()` utility |
| Active users (30d) | `/api/executive/metrics`, `/api/copilot/query` | Consolidate in metrics utility |
| Online staff count | `/api/executive/metrics`, `/api/staff/presence` | Presence already provides this; metrics should call it |
| Capital exposure calc | `/api/executive/risk-health`, `/api/risk/exposure` | Same calculation in two endpoints |
| Inline rate limiting | `src/middleware.ts` | Should use `src/lib/rate-limit/limiter.ts` |
| Inline RBAC checking | `src/middleware.ts` | Should use `src/lib/rbac/engine.ts` |

---

## 7. REMOVE DUPLICATES — Action Plan

### Priority 1: Middleware Consolidation (High Impact)

**Problem:** `src/middleware.ts` contains 200+ lines of duplicated logic that already exists in dedicated modules.

**Actions:**
1. Remove inline `ROUTE_PERMISSIONS` and `API_PERMISSIONS` from middleware → import from `src/config/permissions.ts`
2. Remove inline `checkRateLimit` function → use `src/lib/rate-limit/limiter.ts`
3. Remove inline permission-checking query → use `src/lib/rbac/engine.ts` (NOTE: Edge Runtime incompatibility may require keeping a slim version)
4. Remove inline Supabase client creation → use `src/lib/supabase/middleware.ts` (`updateSession`)

### Priority 2: Shared Query Utilities (Medium Impact)

**Create `src/lib/queries/` with shared data access functions:**
- `src/lib/queries/payout-stats.ts` → `getPayoutStats()`, `getPendingPayoutCount()`
- `src/lib/queries/risk-stats.ts` → `getRiskSummary()`, `getCapitalExposure()`
- `src/lib/queries/kyc-stats.ts` → `getKYCStats()`, `getPendingKYCCount()`
- `src/lib/queries/ticket-stats.ts` → `getTicketStats()`, `getOpenTicketCount()`
- `src/lib/queries/user-stats.ts` → `getActiveUserCount()`

**Then refactor these endpoints to use them:**
- `/api/executive/metrics` — calls all stat utilities
- `/api/executive/queues` — calls queue-specific utilities
- `/api/copilot/query` — calls utilities instead of raw queries

### Priority 3: Feed Consolidation (Low Impact)

**Problem:** `/api/feed` and `/api/executive/activity` both provide "recent events" feeds.

**Action:** Merge into one endpoint with a `source` parameter:
- `source=all` → union of tables (current /api/feed behavior)
- `source=audit` → from audit_records (current /api/executive/activity behavior)

### Priority 4: Session Architecture Decision (Architectural)

**Problem:** Two competing session systems:
1. Supabase Auth (`supabase.auth.getUser()`) — used by middleware, feed, queues, risk-health, system-health, copilot
2. Custom token-hash sessions (`SessionManager`) — used by login, logout, presence

**Action:** Pick ONE. The custom SessionManager is more feature-rich (device tracking, idle timeout, multi-session). If keeping it, remove Supabase Auth calls from routes that use `createClient()` server-side. If using Supabase Auth, remove `src/lib/session/` entirely.

### Priority 5: Audit Logger Consistency (Low Impact)

**Problem:** `/api/export/route.ts` inserts directly into `audit_records` instead of using `AuditLogger`.

**Action:** Replace raw insert with `auditLogger.log()` call.

---

## 8. SUPABASE CLEANUP — Tables Referenced But Not in Types

The following tables are referenced in code but NOT defined in `src/types/database.ts`:

| Table | Referenced In | Action |
|---|---|---|
| `kyc_submissions` | `/api/kyc`, executive endpoints, cron | Add type definition |
| `support_tickets` | `/api/support`, executive endpoints, feed | Add type definition |
| `orders` | `/api/orders`, copilot | Add type definition |
| `affiliates` | `/api/affiliates`, search | Add type definition |
| `certificates` | `/api/certificates` | Add type definition |
| `system_health_checks` | `/api/monitoring/health`, cron | Add type definition |
| `data_exports` | `/api/export`, cron | Add type definition |
| `promotions` | cron/promotion-expiry | Add type definition |
| `coupon_codes` | cron/promotion-expiry | Add type definition |
| `staff_devices` | session/manager.ts | Add type definition |
| `notifications` | lib/notifications/engine.ts | Add type definition |
| `feature_flags` | (referenced in nav, no API yet) | Create table + API or remove nav link |
| `user_notes` | `/api/users/[id]/notes` | Add type definition |

### Unused Lib Modules (Dead Code Candidates)

| Module | Status |
|---|---|
| `src/lib/rate-limit/limiter.ts` | **NEVER imported** by any route or middleware. Middleware has its own inline version. |
| `src/lib/rbac/middleware.ts` (`checkRoutePermission`, `requirePermission`) | **NEVER called** from actual middleware or API routes. |
| `src/lib/session/manager.ts` | Only theoretically used — login route creates challenge tokens directly, not via SessionManager. |
| `src/lib/supabase/middleware.ts` (`updateSession`) | **NEVER imported** by `src/middleware.ts`. |

---

## 9. FINAL VERIFICATION CHECKLIST

| Check | Status | Notes |
|---|---|---|
| Every page has a matching API? | ✅ | All pages fetch from `/api/*` |
| Every API has a matching page? | ⚠️ | `/api/copilot/query`, `/api/feed`, `/api/search`, `/api/export`, `/api/cron/*` are service APIs (no dedicated page) — this is correct |
| Duplicate route permissions? | ❌ FAIL | Defined in BOTH `src/config/permissions.ts` AND `src/middleware.ts` |
| Duplicate rate limiters? | ❌ FAIL | In-memory limiter in BOTH `src/lib/rate-limit/` AND `src/middleware.ts` |
| Duplicate RBAC engines? | ❌ FAIL | Full engine in `src/lib/rbac/` AND inline in `src/middleware.ts` |
| Duplicate session systems? | ❌ FAIL | Custom SessionManager AND Supabase Auth both active |
| Duplicate activity feeds? | ❌ FAIL | `/api/feed` AND `/api/executive/activity` |
| Duplicate health endpoints? | ⚠️ | `/api/executive/system-health` (live) vs `/api/monitoring/health` (stored) — arguably different purposes |
| Audit consistency? | ❌ FAIL | Export route bypasses AuditLogger |
| DB types complete? | ❌ FAIL | 13 tables missing from `src/types/database.ts` |
| Dead code present? | ❌ FAIL | 4 lib modules are never imported |

---

## SUMMARY

**Total Duplications Found:** 9 significant duplication areas  
**Dead Code Modules:** 4  
**Missing DB Types:** 13 tables  
**Architecture Conflict:** Dual session system (custom vs Supabase Auth)  

**Recommended Priority Order:**
1. Resolve session architecture (pick one system)
2. Consolidate middleware to use existing lib modules
3. Create shared query utilities to eliminate repeated Supabase calls
4. Add missing type definitions
5. Remove dead code modules or wire them up
6. Merge duplicate feed endpoints
