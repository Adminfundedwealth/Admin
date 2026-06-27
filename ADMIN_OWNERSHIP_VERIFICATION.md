# Admin Ownership Verification Report

**Date:** June 23, 2026  
**Scope:** Verify implementation status of 5 critical admin workflows

---

## 1. PAYOUT APPROVAL WORKFLOW

**Classification: IMPLEMENTED**

### Files
| File | Purpose |
|---|---|
| `src/app/api/payouts/[id]/[action]/route.ts` | API: approve, reject, retry actions |
| `src/app/api/payouts/[id]/route.ts` | API: payout detail + status history |
| `src/app/api/payouts/route.ts` | API: list + analytics |
| `src/app/(dashboard)/payouts/[payoutId]/page.tsx` | UI: detail page with approve/reject/retry buttons |
| `src/app/(dashboard)/payouts/page.tsx` | UI: payout list page |

### Routes
| Route | Implemented |
|---|---|
| `/payouts` | ✅ List with filters (status, date) |
| `/payouts/[payoutId]` | ✅ Detail with workflow progress stepper |

### APIs
| Endpoint | Method | Implemented |
|---|---|---|
| `/api/payouts` | GET | ✅ List + analytics (total paid, pending, avg processing time, rejection rate) |
| `/api/payouts/[id]` | GET | ✅ Detail + status history timeline |
| `/api/payouts/[id]/approve` | POST | ✅ Status transition: under_review → approved |
| `/api/payouts/[id]/reject` | POST | ✅ Requires 10-1000 char reason; records rejection |
| `/api/payouts/[id]/retry` | POST | ✅ Retries failed payment: payment_failed → payment_processing |

### Tables
| Table | Usage |
|---|---|
| `payout_requests` | Core table (status, amounts, reviewer, approver, timestamps) |
| `payout_status_history` | Append-only status change log |
| `audit_records` | Audit trail for all payout actions |

### Evidence
- Full state machine defined: `request_received → under_review → approved → payment_processing → payment_completed`
- Rejection requires 10-1000 char reason (validated with Zod)
- Status history recorded in `payout_status_history` table
- Audit record created on every action
- UI has visual workflow stepper showing current step
- UI conditionally shows Approve/Reject/Retry buttons based on current status
- **Gap:** `staffId` hardcoded to `'00000000-...'` (TODO in code — session not wired)
- **Gap:** `payouts.approve` permission check is a TODO comment, not enforced

---

## 2. CHALLENGE PROMOTION (Pass → Funded Account)

**Classification: PARTIAL**

### Files
| File | Purpose |
|---|---|
| `src/app/api/challenges/[id]/[action]/route.ts` | API: pass, fail, retry, reset, extend, upgrade, archive, restore |
| `src/app/api/challenges/[id]/route.ts` | API: challenge detail + timeline |
| `src/app/(dashboard)/challenges/[challengeId]/page.tsx` | UI: detail with action buttons |

### Routes
| Route | Implemented |
|---|---|
| `/challenges/[challengeId]` | ✅ Detail page with pass/upgrade buttons |

### APIs
| Endpoint | Method | Implemented |
|---|---|---|
| `/api/challenges/[id]/pass` | POST | ✅ Transitions active → passed (requires 20 char justification) |
| `/api/challenges/[id]/upgrade` | POST | ⚠️ PARTIAL — Accepted as valid action for `passed` status, but does NOT create a funded account |

### Tables
| Table | Usage |
|---|---|
| `challenge_accounts` | Status update (active → passed) |
| `challenge_timeline` | Action history log |
| `audit_records` | Audit trail |
| `funded_accounts` | ❌ NOT written to during upgrade |

### Evidence
- "Pass" action: fully implemented with state transition, 20-char minimum justification, timeline entry, audit record
- "Upgrade" action: defined in `VALID_TRANSITIONS` as `passed: { upgrade: 'passed' }` — the status stays `passed`, no new status is set
- **No code exists** to create a `funded_accounts` row when a challenge is upgraded
- The UI shows "Upgrade" button for passed challenges (via `VALID_ACTIONS['passed'] = ['upgrade', 'archive']`)
- The `funded_accounts` table exists with a `challenge_account_id` foreign key field, but nothing populates it from this workflow
- `/api/funded/[id]` PATCH route exists but only handles general modification, not creation
- **Missing:** The actual business logic to create a funded account from a passed challenge

---

## 3. CHALLENGE EXPIRY

**Classification: NOT IMPLEMENTED**

### Files
| File | Purpose |
|---|---|
| (none) | No cron job or background task for challenge expiry |

### Routes
- No route handles automatic challenge expiry.

### APIs
| Endpoint | Exists |
|---|---|
| `/api/cron/challenge-expiry` | ❌ Does not exist |
| Any scheduled expiry handler | ❌ Does not exist |

### Tables
| Table | Field | Status |
|---|---|---|
| `challenge_accounts` | `expires_at` | ✅ Field defined (nullable) |
| `challenge_accounts` | `status: 'expired'` | ✅ Status value defined in types |

### Evidence
- `expires_at` field exists in `challenge_accounts` type definition and the challenge detail UI displays it
- The `VALID_TRANSITIONS` map includes `expired: { reset: 'active', archive: 'archived' }` — so the status can be manually set/handled
- **No cron job** exists under `/api/cron/` for challenge expiry (existing crons: session-cleanup, risk-escalation, health-check, kyc-overdue, login-history-cleanup, promotion-expiry, export-cleanup)
- **No background worker** or scheduled task auto-transitions challenges from `active` → `expired` when `expires_at < now`
- Manual workaround: A staff member could presumably fail/archive an expired challenge, but there is no automated system

---

## 4. ACCOUNT UNLOCK (Staff Member Account)

**Classification: NOT IMPLEMENTED**

### Files
| File | Purpose |
|---|---|
| `src/app/api/auth/login/route.ts` | Auto-unlock after lockout period passes (self-service) |

### Routes
- No admin route exists for manual staff account unlock.

### APIs
| Endpoint | Exists |
|---|---|
| `/api/staff/[id]/unlock` | ❌ Does not exist |
| Any admin unlock endpoint | ❌ Does not exist |

### Tables
| Table | Field | Status |
|---|---|---|
| `staff_members` | `status: 'locked'` | ✅ Status value exists |
| `staff_members` | `locked_until` | ✅ Field exists |
| `staff_members` | `failed_login_attempts` | ✅ Field exists |

### Evidence
- **Lockout mechanism exists:** After 5 failed login attempts → status = 'locked', locked_until = now + 30min (in `/api/auth/login`)
- **Self-service unlock exists:** When a locked user tries to login after `locked_until` has passed, the login route resets: `{ status: 'active', failed_login_attempts: 0, locked_until: null }`
- **No admin unlock API:** There is no POST/PATCH endpoint for an admin to manually unlock a locked staff account before the 30-min timer expires
- **No UI for unlock:** The `/staff` page lists staff members but has no action buttons for unlock/enable/disable
- The staff API (`/api/staff`) only has a GET handler (list), no PATCH/POST for status changes
- The `src/lib/session/manager.ts` has `invalidateAll(staffId)` which could be part of an unlock flow, but is never called from an admin endpoint

---

## 5. USER SUSPENSION/ACTIVATION

**Classification: PARTIAL**

### Files
| File | Purpose |
|---|---|
| `src/app/(dashboard)/users/[userId]/page.tsx` | UI: Suspend + Ban buttons with reason modal |
| `src/types/database.ts` | Type: `account_status: 'active' \| 'suspended' \| 'banned' \| 'deactivated'` |

### Routes
| Route | Implemented |
|---|---|
| `/users/[userId]` | ✅ Detail page with Suspend/Ban buttons |

### APIs
| Endpoint | Method | Exists |
|---|---|---|
| `/api/users/[userId]/suspend` | POST | ❌ Does not exist |
| `/api/users/[userId]/ban` | POST | ❌ Does not exist |
| `/api/users/[userId]/activate` | POST | ❌ Does not exist |
| Any user action endpoint | — | ❌ None |

### Tables
| Table | Field | Status |
|---|---|---|
| `users` | `account_status` | ✅ Defined: 'active', 'suspended', 'banned', 'deactivated' |
| `users` | `ban_reason` | ✅ Field exists (nullable) |

### Evidence
- **UI exists:** The user detail page has "Suspend" and "Ban" buttons that open a modal requiring a 10+ char reason
- **UI calls non-existent API:** The `handleUserAction` function calls `fetch(\`/api/users/${userId}/${action}\`)` with POST method — but no matching route handler exists
- **No API route:** `/api/users/[id]/route.ts` only exports GET (profile fetch). No `[action]` dynamic segment route exists under `/api/users/[id]/`
- **No activation endpoint:** No way to re-activate a suspended/banned user from the admin panel
- **Type support exists:** The `account_status` field with all values is properly typed in `database.ts`
- The `permissions.ts` defines `users.ban` permission but it's never enforced since the endpoint doesn't exist

---

## SUMMARY TABLE

| # | Feature | Status | UI | API | DB Schema | Business Logic |
|---|---|---|---|---|---|---|
| 1 | Payout Approval Workflow | **IMPLEMENTED** | ✅ | ✅ | ✅ | ✅ (minor gaps: session/permission TODOs) |
| 2 | Challenge Promotion | **PARTIAL** | ✅ | ⚠️ | ✅ | ❌ (no funded account creation) |
| 3 | Challenge Expiry | **NOT IMPLEMENTED** | — | ❌ | ✅ (field exists) | ❌ (no cron/automation) |
| 4 | Account Unlock | **NOT IMPLEMENTED** | ❌ | ❌ | ✅ (field exists) | ❌ (only self-service timer) |
| 5 | User Suspension/Activation | **PARTIAL** | ✅ | ❌ | ✅ | ❌ (UI calls missing API) |
