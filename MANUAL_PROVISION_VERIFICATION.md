# Manual Provision MVP — Live Verification Checklist

Execute each step against the deployed production environment.
Mark PASS or FAIL for each. All must PASS to consider the feature complete.

---

## Prerequisites

- Admin panel deployed and accessible
- Logged in as Founder/Co-Founder (full access)
- Supabase dashboard open (SQL Editor)
- At least one paid order exists in the `orders` table

### Find a test order (run in Supabase SQL Editor):

```sql
SELECT o.id, o.user_id, o.amount, o.account_size, o.plan_type, o.status,
       o.payment_method, o.utr_reference, o.created_at,
       u.email, u.first_name, u.last_name
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.status IN ('completed', 'paid', 'active')
ORDER BY o.created_at DESC
LIMIT 5;
```

**Record the values:**
- Order ID: `__________________`
- User Email: `__________________`
- UTR Reference: `__________________`

---

## Step 1: Search Paid Order by Email

**Action:**
1. Open: `https://admin.fundedwealth.com/provision`
2. Enter the user's email address in the search box
3. Click "Search"

**Expected Result:**
- Table appears showing matching orders
- Columns visible: Name, Email, Order ID, Challenge, Account Size, Payment Status, UTR, Provision Status, Actions
- The target order appears with status `completed` / `paid` / `active`
- "View" and "Provision" buttons are visible

**PASS criteria:** Order found, all columns populated, Provision button enabled  
**FAIL criteria:** No results, error message, or missing columns

**Result:** ☐ PASS / ☐ FAIL  
**Evidence:**

---

## Step 2: Search Paid Order by UTR

**Action:**
1. Clear the search box
2. Enter the UTR reference value from the order
3. Click "Search"

**Expected Result:**
- Same order appears in results
- UTR column matches the search input

**PASS criteria:** Order found via UTR search  
**FAIL criteria:** No results when searching valid UTR

**Result:** ☐ PASS / ☐ FAIL  
**Evidence:**

---

## Step 3: View Order Details

**Action:**
1. Click "View" button on the target order row

**Expected Result:**
- Detail panel opens below the table
- Shows: Name, Email, Order ID, Amount, Account Size, Plan Type, Payment Method, UTR Reference, Payment Status, Provision Status, Order Date
- "Provision This Account" button visible (if not already provisioned)

**PASS criteria:** All fields display correctly, no "undefined" or "null" visible for populated fields  
**FAIL criteria:** Panel doesn't open, fields show raw null/undefined

**Result:** ☐ PASS / ☐ FAIL  
**Evidence:**

---

## Step 4: Manual Provision (Execute Provisioning)

**Action:**
1. Click "Provision" button (or "Provision This Account" from View panel)
2. Confirmation modal opens
3. Verify UTR field is pre-filled
4. Select Challenge Type (evaluation/express/stellar)
5. Confirm or adjust Account Size
6. Optionally enter a Plan name
7. Optionally enter Notes
8. Click "Confirm & Provision"

**Expected Result:**
- Loading spinner shows during processing
- Modal closes
- Green success card appears with:
  - Generated Login ID (format: `FW-XXXXXXXX`)
  - Generated Password (12 characters)
  - User name and email
  - Account size
  - Plan and challenge type
  - Email status (✓ Sent or ✗ Failed)
  - Provisioned timestamp
- "Copy Credentials" and "Resend Email" buttons visible
- Order row in table updates to show "completed" provision status
- Toast notification appears: "Account provisioned for [email]"

**PASS criteria:** Credentials generated and displayed, no error  
**FAIL criteria:** Error message in modal, 500 response, or no credentials shown

**Record generated credentials:**
- Login ID: `__________________`
- Password: `__________________`

**Result:** ☐ PASS / ☐ FAIL  
**Evidence:**

---

## Step 5: Verify challenge_accounts

**SQL Query (Supabase SQL Editor):**

```sql
SELECT id, trader_id, type, plan, initial_balance, current_balance,
       peak_balance, status, started_at, created_at
FROM challenge_accounts
WHERE trader_id = '<USER_ID_FROM_ORDER>'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
| Column | Expected Value |
|--------|---------------|
| trader_id | Matches `user_id` from the order |
| type | `evaluation` / `express` / `stellar` (what you selected) |
| plan | Plan name you entered (or order's plan_type) |
| initial_balance | Account size you confirmed |
| current_balance | Same as initial_balance |
| peak_balance | Same as initial_balance |
| status | `active` |
| started_at | Recent timestamp (within last few minutes) |

**PASS criteria:** Row exists with all values matching  
**FAIL criteria:** No row found, or values don't match

**Result:** ☐ PASS / ☐ FAIL  
**Evidence (paste row):**

---

## Step 6: Verify trading_accounts

**SQL Query:**

```sql
SELECT id, trader_id, challenge_id, account_code, broker_provider,
       balance, status, created_at
FROM trading_accounts
WHERE trader_id = '<USER_ID_FROM_ORDER>'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
- This depends on whether Terminal processes the provisioning_log automatically
- If Terminal auto-processes: a row should exist linking to the challenge_account
- If Terminal requires manual trigger: no row yet (this is expected for the MVP)

**PASS criteria:** Either (a) row exists with correct trader_id, OR (b) no row exists but provisioning_logs shows `completed` (Terminal will process later)  
**FAIL criteria:** Error querying the table, or conflicting data

**Result:** ☐ PASS / ☐ FAIL  
**Notes:**

---

## Step 7: Verify provisioning_logs

**SQL Query:**

```sql
SELECT id, order_id, trader_id, trading_account_id, challenge_account_id,
       plan, payment_method, payment_ref, source, status,
       started_at, completed_at, created_at
FROM provisioning_logs
WHERE order_id = '<ORDER_ID>'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
| Column | Expected Value |
|--------|---------------|
| order_id | The order ID you provisioned |
| trader_id | User ID from the order |
| challenge_account_id | ID from Step 5 result |
| plan | Plan name used |
| payment_method | Order's payment method or `manual` |
| payment_ref | UTR reference you entered |
| source | `admin_manual` |
| status | `completed` |
| started_at | Recent timestamp |
| completed_at | Recent timestamp |

**PASS criteria:** Row exists, `status = 'completed'`, `source = 'admin_manual'`  
**FAIL criteria:** No row, or status is `pending`/`failed`

**Result:** ☐ PASS / ☐ FAIL  
**Evidence (paste row):**

---

## Step 8: Verify orders status update

**SQL Query:**

```sql
SELECT id, status, updated_at
FROM orders
WHERE id = '<ORDER_ID>';
```

**Expected Result:**
| Column | Expected Value |
|--------|---------------|
| status | `active` |
| updated_at | Recent timestamp (after provisioning) |

**PASS criteria:** Status changed to `active`  
**FAIL criteria:** Status unchanged from original value

**Result:** ☐ PASS / ☐ FAIL  
**Evidence:**

---

## Step 9: Verify admin_events (if applicable)

**SQL Query:**

```sql
SELECT * FROM admin_events
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Result:**
- If `admin_events` table exists: check for a provision-related entry
- If table does NOT exist: this step is N/A (the codebase uses `audit_records` instead)

**PASS criteria:** Entry exists, OR table doesn't exist (N/A)  
**FAIL criteria:** Table exists but no relevant entry

**Result:** ☐ PASS / ☐ FAIL / ☐ N/A  
**Evidence:**

---

## Step 10: Verify audit_records

**SQL Query:**

```sql
SELECT id, actor_id, actor_role, action, target_entity_type,
       target_entity_id, new_state, metadata, timestamp
FROM audit_records
WHERE action = 'provision.manual'
  AND target_entity_id = '<ORDER_ID>'
ORDER BY timestamp DESC
LIMIT 1;
```

**Expected Result:**
| Column | Expected Value |
|--------|---------------|
| action | `provision.manual` |
| target_entity_type | `order` |
| target_entity_id | The order ID |
| actor_role | `founder` or `co_founder` |
| new_state | JSON containing `challenge_account_id`, `login_id`, `account_size`, `plan` |
| metadata | JSON containing `utr_reference`, `email_sent: true/false` |

**PASS criteria:** Row exists with correct action and entity  
**FAIL criteria:** No audit record for this provision

**Result:** ☐ PASS / ☐ FAIL  
**Evidence (paste row):**

---

## Step 11: Verify credentials email

**Action:**
1. Open Resend dashboard: `https://resend.com/emails`
2. Search for the user's email address
3. Find the email with subject: "Your FundedWealth Trading Account is Ready!"

**Expected Result:**
- Email was delivered
- Contains correct Login ID and Password
- Contains correct account size and plan
- "Login to Trading Terminal" button links to `https://terminal.fundedwealth.com`

**Alternative (if Resend not configured):**
- In Step 4 result, "Email Status" shows "✗ Failed"
- Use "Copy Credentials" button to get credentials manually
- This is acceptable for pre-launch MVP

**PASS criteria:** Email delivered with correct credentials, OR email failed but Copy Credentials works  
**FAIL criteria:** Neither email nor copy works

**Result:** ☐ PASS / ☐ FAIL  
**Evidence:**

---

## Step 12: Verify Terminal Login

**Action:**
1. Open: `https://terminal.fundedwealth.com`
2. Enter the generated Login ID
3. Enter the generated Password
4. Click Login

**Expected Result:**
- Successful login
- Trader dashboard loads
- Account shows correct balance matching account_size

**NOTE:** This step depends on Terminal recognizing the provisioned account. If Terminal requires additional processing (broker setup), this may not work immediately. In that case:
- Check if Terminal has a webhook or cron that processes `provisioning_logs` with `status = 'completed'`
- The admin_manual provision creates the challenge_accounts entry; Terminal may need to create trading_accounts before login works

**PASS criteria:** Login succeeds and dashboard loads  
**FAIL criteria (acceptable for MVP):** Terminal doesn't yet recognize the account (requires Terminal-side processing)  
**FAIL criteria (unacceptable):** Login crashes or shows error unrelated to account setup

**Result:** ☐ PASS / ☐ FAIL / ☐ PENDING (Terminal processing required)  
**Evidence:**

---

## Step 13: Verify Duplicate Provisioning Protection

**Action:**
1. Return to `https://admin.fundedwealth.com/provision`
2. Search for the SAME email or UTR you just provisioned
3. Observe the order row

**Expected Result (UI):**
- Order shows Provision Status: `completed`
- "Provision" button is NOT visible (replaced by "✓ Done")
- Only "View" button is available

**Action (force test via API):**
Open browser console or use curl:

```bash
curl -X POST https://admin.fundedwealth.com/api/provision/manual \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=YOUR_SESSION" \
  -d '{"order_id":"<ORDER_ID>","utr_reference":"<UTR>"}'
```

**Expected API Response:**
```json
{
  "error": {
    "code": "ALREADY_PROVISIONED",
    "message": "This order has already been provisioned or is currently being processed."
  }
}
```
HTTP Status: `409 Conflict`

**SQL Verification (no duplicate rows):**

```sql
SELECT COUNT(*) as provision_count
FROM provisioning_logs
WHERE order_id = '<ORDER_ID>' AND status = 'completed';
```

Expected: `provision_count = 1` (exactly one)

**PASS criteria:** UI hides button + API returns 409 + only 1 provisioning_log row  
**FAIL criteria:** Can provision same order twice, or multiple rows created

**Result:** ☐ PASS / ☐ FAIL  
**Evidence:**

---

## Summary

| # | Check | Result |
|---|-------|--------|
| 1 | Search by Email | ☐ PASS / ☐ FAIL |
| 2 | Search by UTR | ☐ PASS / ☐ FAIL |
| 3 | View Order | ☐ PASS / ☐ FAIL |
| 4 | Manual Provision | ☐ PASS / ☐ FAIL |
| 5 | challenge_accounts | ☐ PASS / ☐ FAIL |
| 6 | trading_accounts | ☐ PASS / ☐ FAIL / ☐ PENDING |
| 7 | provisioning_logs | ☐ PASS / ☐ FAIL |
| 8 | orders status | ☐ PASS / ☐ FAIL |
| 9 | admin_events | ☐ PASS / ☐ FAIL / ☐ N/A |
| 10 | audit_records | ☐ PASS / ☐ FAIL |
| 11 | Credentials email | ☐ PASS / ☐ FAIL |
| 12 | Terminal login | ☐ PASS / ☐ FAIL / ☐ PENDING |
| 13 | Duplicate protection | ☐ PASS / ☐ FAIL |

**Feature Complete:** ☐ YES / ☐ NO  
**Blockers (if any):**

---

## Quick Reference

| Resource | URL |
|----------|-----|
| Admin Panel | `https://admin.fundedwealth.com/provision` |
| Supabase Dashboard | `https://supabase.com/dashboard` → SQL Editor |
| Resend Dashboard | `https://resend.com/emails` |
| Terminal | `https://terminal.fundedwealth.com` |
| GitHub Repo | `https://github.com/Adminfundedwealth/Admin` |
| Latest Commit | `31a6577` |
