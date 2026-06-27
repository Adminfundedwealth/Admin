# Supabase Key Rotation Procedure

## CRITICAL: Previous keys were exposed in .env.local

The following keys were committed/visible in plaintext and MUST be rotated immediately:

- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Steps to Rotate

### 1. Rotate Service Role Key
1. Go to: https://supabase.com/dashboard/project/nysrxvpjdlvzvcawysvh/settings/api
2. Click "Rotate" next to the service_role key
3. Copy the new key
4. Update in your deployment environment (Vercel, etc.)

### 2. Rotate Anon Key
1. Same dashboard page
2. Click "Rotate" next to the anon key
3. Copy the new key
4. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` in deployment

### 3. Generate New Secrets
Run these commands to generate secure random values:

```bash
# TOTP Encryption Key
openssl rand -hex 32

# CRON Secret
openssl rand -hex 32

# Session Secret
openssl rand -hex 32
```

### 4. Update Environment Variables
Set these in your hosting provider (Vercel/Railway/etc.):

```
NEXT_PUBLIC_SUPABASE_URL=https://nysrxvpjdlvzvcawysvh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<new-rotated-key>
SUPABASE_SERVICE_ROLE_KEY=<new-rotated-key>
TOTP_ENCRYPTION_KEY=<generated-hex>
CRON_SECRET=<generated-hex>
SESSION_SECRET=<generated-hex>
```

### 5. Run TOTP Migration
After setting `TOTP_ENCRYPTION_KEY`, run the migration to encrypt existing secrets:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://your-domain.com/api/cron/migrate-totp
```

### 6. Clean Git History (Optional but Recommended)
The old key `eyJhbGci...7j0` may still be in git history.

```bash
# Use BFG Repo Cleaner or git-filter-repo
git filter-repo --replace-text <(echo 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0==>REDACTED_KEY')
```

### 7. Upstash Redis Setup (for rate limiting)
1. Create account at https://upstash.com
2. Create a Redis database
3. Copy REST URL and Token
4. Set in environment:

```
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

### 8. Verify
After rotation:
- [ ] Old keys return 401 from Supabase API
- [ ] Application starts with new keys
- [ ] Login flow works end-to-end
- [ ] TOTP migration completed (0 failed)
- [ ] Rate limiting via Redis works (check Upstash dashboard)

## Cadence
- Rotate keys every 90 days minimum
- Rotate immediately if any key is exposed in logs, commits, or screenshots
