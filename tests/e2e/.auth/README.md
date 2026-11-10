# Auth State — founder.json

`founder.json` must contain a valid Playwright `storageState` with the Supabase
auth token before any E2E tests can run against `admin.fundedwealth.com`.

The file is **not committed** (it contains live session tokens).

---

## Method 1 — CDP capture (recommended, no credentials needed)

This reads the auth token directly from a live Brave session.

### Steps

1. Make sure you are **not** already logged out of admin.fundedwealth.com in Brave.
2. Open a terminal in `C:\Users\rmsam\fundedwealth\admin-os`.
3. Run:
   ```
   node tests/e2e/setup/capture-cdp.mjs
   ```
4. A new Brave window opens at `https://admin.fundedwealth.com`.
   - If you land on the **dashboard** (already authenticated), the script captures
     the token automatically and exits within a few seconds.
   - If you land on the **login page**, log in manually in that window.
     The script polls for up to 2 minutes, then writes `founder.json` once it
     detects the token.
5. When you see `storageState written to …founder.json`, the file is ready.

> **Note:** The script uses a fresh temporary Brave profile
> (`%TEMP%\pw-cdp-brave`) so it won't conflict with your main Brave window.
> Your main Brave session is not touched. The script closes the CDP connection
> but leaves the Brave window open.

**What it captures:**

- Supabase key: `sb-nysrxvpjdlvzvcawysvh-auth-token`
- All other `localStorage` entries from `https://admin.fundedwealth.com`
- Stored in Playwright `storageState` format: `{ cookies: [], origins: [...] }`

---

## Method 2 — Password-based login via Playwright

This runs a headless Chromium login flow.

### Steps

1. Open (or create) `C:\Users\rmsam\fundedwealth\admin-os\.env.local.backup`.
2. Add your credentials using **any** of these key names:
   ```
   ADMIN_EMAIL=your-admin@example.com
   ADMIN_PASSWORD=your-password
   ```
   Other accepted names: `ADMIN_TEST_EMAIL`, `ADMIN_TEST_PASSWORD`,
   `TEST_EMAIL`, `TEST_PASSWORD`, `PLAYWRIGHT_EMAIL`, `PLAYWRIGHT_PASSWORD`,
   or any `*_EMAIL` / `*_PASSWORD` pair.
3. Run from `C:\Users\rmsam\fundedwealth\admin-os`:
   ```
   npx playwright test tests/e2e/setup/auth.setup.ts --project=chromium --config=playwright.config.ts
   ```
4. If 2FA is required, the script saves a screenshot to
   `C:\Users\rmsam\fundedwealth\.agents\tasks\admin-os-audit\screenshots\2fa-prompt.png`
   and exits with an error message. Manual OTP entry will be needed.

---

## Verifying the file

After either method, `founder.json` should look like:

```json
{
  "cookies": [],
  "origins": [
    {
      "origin": "https://admin.fundedwealth.com",
      "localStorage": [
        { "name": "sb-nysrxvpjdlvzvcawysvh-auth-token", "value": "..." },
        ...
      ]
    }
  ]
}
```

If `founder.json` contains only `{}`, authentication has not been captured yet.
