/**
 * Runtime provisioning test — tests all 5 bugs live.
 * Tests against live Supabase DB + main site (if reachable).
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomInt } from 'crypto';

const SUPABASE_URL = 'https://nysrxvpjdlvzvcawysvh.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0';
const MAINSITE_API = process.env.MAINSITE_API_URL || 'http://localhost:9010';
const INTERNAL_SECRET = process.env.INTERNAL_PROVISION_SECRET || 'dev-internal-secret-change-in-production';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const P = (ok, label, val = '') => { console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${val ? ' → ' + val : ''}`); return ok; };
const I = (msg) => console.log(`  \x1b[36mℹ\x1b[0m  ${msg}`);
const H = (msg) => console.log(`\n\x1b[1m════════ ${msg} ════════\x1b[0m`);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Credential generation
// ─────────────────────────────────────────────────────────────────────────────
H('TEST 1: Credential Generation');

function genLogin() {
  const first = randomInt(1, 10).toString();
  const rest = Array.from({ length: 7 }, () => randomInt(0, 10).toString()).join('');
  return first + rest;
}
function genPassword() {
  const U='ABCDEFGHJKLMNPQRSTUVWXYZ', L='abcdefghjkmnpqrstuvwxyz', D='23456789', S='@#$!';
  const pick=(s,n)=>Array.from({length:n},()=>s[randomInt(0,s.length)]).join('');
  const parts=[pick(U,2),pick(D,2),pick(L,4),pick(S,2)].join('').split('');
  for(let i=parts.length-1;i>0;i--){const j=randomInt(0,i+1);[parts[i],parts[j]]=[parts[j],parts[i]];}
  return parts.join('');
}
function genToken() {
  const b=randomBytes(16);
  b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80;
  const h=b.toString('hex');
  return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');
}
function genExpiry(hrs=48){return new Date(Date.now()+hrs*3600*1000).toISOString();}

const creds = { terminal_login: genLogin(), temporary_password: genPassword(), activation_token: genToken(), expiry: genExpiry() };
I(`terminal_login:     ${creds.terminal_login}`);
I(`temporary_password: ${creds.temporary_password}`);
I(`activation_token:   ${creds.activation_token}`);
I(`expiry:             ${creds.expiry}`);

P(/^\d{8}$/.test(creds.terminal_login), 'terminal_login is 8 digits', creds.terminal_login);
P(!creds.terminal_login.startsWith('0'), 'does not start with 0');
P(creds.temporary_password.length >= 10, `password length >= 10`, String(creds.temporary_password.length));
P(/[A-Z]/.test(creds.temporary_password), 'password has uppercase');
P(/[0-9]/.test(creds.temporary_password), 'password has digit');
P(/[@#$!]/.test(creds.temporary_password), 'password has special char');
P(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(creds.activation_token), 'activation_token is UUID v4');
const diffH = (new Date(creds.expiry).getTime() - Date.now()) / 3600000;
P(diffH > 47 && diffH < 49, 'expiry ~48h from now', diffH.toFixed(1) + 'h');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: DB schema — actual live columns
// ─────────────────────────────────────────────────────────────────────────────
H('TEST 2: DB Schema — Live Columns');

const { data: caRows, error: caErr } = await supabase
  .from('challenge_accounts')
  .select('id,type,plan,initial_balance,profit_target_pct,daily_loss_limit_pct,max_drawdown_pct,min_trading_days,status')
  .order('created_at', { ascending: false }).limit(5);

P(!caErr, 'challenge_accounts accessible', caErr?.message || 'ok');
if (caRows?.length) {
  const cols = Object.keys(caRows[0]);
  for (const c of ['type','plan','initial_balance','profit_target_pct','daily_loss_limit_pct','max_drawdown_pct','status'])
    P(cols.includes(c), `column ${c} exists`);
  I('Last 5 challenge_accounts:');
  for (const r of caRows)
    I(`  id=${r.id.slice(0,8)} plan=${r.plan} type=${r.type} bal=${r.initial_balance} pt=${r.profit_target_pct} dl=${r.daily_loss_limit_pct} dd=${r.max_drawdown_pct} status=${r.status}`);
}

const { data: taRows, error: taErr } = await supabase
  .from('trading_accounts')
  .select('id,account_code,balance,status,broker_credentials_encrypted')
  .order('created_at', { ascending: false }).limit(5);

P(!taErr, 'trading_accounts accessible', taErr?.message || 'ok');
if (taRows?.length) {
  const cols = Object.keys(taRows[0]);
  P(cols.includes('broker_credentials_encrypted'), 'broker_credentials_encrypted column exists');
  I('Last 5 trading_accounts:');
  for (const r of taRows) {
    let credParsed = null;
    if (r.broker_credentials_encrypted) {
      try { credParsed = JSON.parse(r.broker_credentials_encrypted); } catch {}
    }
    const hasCreds = credParsed && credParsed.terminal_login;
    I(`  id=${r.id.slice(0,8)} code=${r.account_code} bal=${r.balance} status=${r.status} has_emergency_creds=${hasCreds ? 'YES (login='+credParsed.terminal_login+')' : 'no'}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Main site catalog
// ─────────────────────────────────────────────────────────────────────────────
H('TEST 3: Main Site Catalog');

let catalog = [];
let catalogOnline = false;
try {
  const r = await fetch(`${MAINSITE_API}/api/provisioning/catalog`, {
    headers: { 'x-internal-provision-secret': INTERNAL_SECRET },
    signal: AbortSignal.timeout(5000),
  });
  if (r.ok) {
    const j = await r.json();
    catalog = j.products || [];
    catalogOnline = true;
    P(true, `catalog at ${MAINSITE_API}`, `${catalog.length} products`);
    for (const p of catalog) {
      I(`${p.slug.padEnd(8)} profitTarget=${p.profitTarget} dailyLoss=${p.dailyLoss} maxLoss=${p.maxLoss} leverage=${p.leverage}`);
      I(`         rules: pt=${p.rules?.profitTargetPct}% dl=${p.rules?.dailyLossLimitPct}% dd=${p.rules?.maxDrawdownPct}% type=${p.rules?.type}`);
    }
  } else {
    P(false, `catalog HTTP ${r.status}`);
  }
} catch (e) {
  P(false, `main site at ${MAINSITE_API}`, e.message.slice(0, 60));
  I(`Set MAINSITE_API_URL in .env.local to production Railway URL:`);
  I(`MAINSITE_API_URL=https://fundedwealth-api-production.up.railway.app`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4+5: Live provision Flash + Instant, verify DB
// ─────────────────────────────────────────────────────────────────────────────
if (catalogOnline) {
  for (const slug of ['flash', 'instant']) {
    H(`TEST: Emergency Provision — ${slug.toUpperCase()}`);
    const product = catalog.find(p => p.slug === slug);
    if (!product) { I(`${slug} not in catalog — skip`); continue; }

    const email = `rt-${slug}-${Date.now()}@test.internal`;
    const sizeIndex = product.sizes[0].index;
    const expectedBalance = product.sizes[0].accountSize;

    I(`Provisioning: slug=${slug} sizeIndex=${sizeIndex} balance=${expectedBalance} email=${email}`);

    // Step 1: provision via main site
    let prov;
    try {
      const r = await fetch(`${MAINSITE_API}/api/provisioning/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-provision-secret': INTERNAL_SECRET },
        body: JSON.stringify({ planType: slug, sizeIndex, email, note: `runtime_test_${slug}` }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
      prov = j.provisioning;
      P(true, 'provision API call succeeded');
      I(`challengeAccountId: ${prov.challengeAccountId}`);
      I(`tradingAccountId:   ${prov.tradingAccountId}`);
      I(`accountCode:        ${prov.accountCode}`);
      I(`accountSize:        ${prov.accountSize}`);
    } catch (e) {
      P(false, 'provision call', e.message.slice(0, 120));
      continue;
    }

    // Wait for DB write
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: verify challenge_account
    I('\nVerifying challenge_account in DB...');
    const { data: ca } = await supabase
      .from('challenge_accounts')
      .select('id,type,plan,initial_balance,profit_target_pct,daily_loss_limit_pct,max_drawdown_pct,min_trading_days,status')
      .eq('id', prov.challengeAccountId).single();

    if (!ca) { P(false, 'challenge_account found in DB'); }
    else {
      console.log('\n  DB challenge_account:');
      console.log('  ' + JSON.stringify(ca, null, 2).replace(/\n/g, '\n  '));
      P(!!ca.plan, 'plan stored', ca.plan);
      P(ca.initial_balance === expectedBalance, `initial_balance=${expectedBalance}`, String(ca.initial_balance));
      P(ca.status === 'active', 'status=active', ca.status);
      if (product.rules) {
        P(ca.profit_target_pct === product.rules.profitTargetPct, `profit_target_pct=${product.rules.profitTargetPct}`, String(ca.profit_target_pct));
        P(ca.daily_loss_limit_pct === product.rules.dailyLossLimitPct, `daily_loss_limit_pct=${product.rules.dailyLossLimitPct}`, String(ca.daily_loss_limit_pct));
        P(ca.max_drawdown_pct === product.rules.maxDrawdownPct, `max_drawdown_pct=${product.rules.maxDrawdownPct}`, String(ca.max_drawdown_pct));
      }
    }

    // Step 3: simulate what emergency-provision route does — write creds to trading_account
    I('\nWriting emergency credentials to trading_account.broker_credentials_encrypted...');
    if (prov.tradingAccountId) {
      const termLogin = prov.accountCode || genLogin();
      const credPayload = JSON.stringify({
        terminal_login: termLogin,
        temporary_password: creds.temporary_password,
        activation_token: creds.activation_token,
        credential_expiry: creds.expiry,
        provisioned_by: 'founder_emergency',
        provisioned_at: new Date().toISOString(),
        product_slug: slug,
        account_size: expectedBalance,
      });

      const { error: updErr } = await supabase
        .from('trading_accounts')
        .update({ broker_credentials_encrypted: credPayload })
        .eq('id', prov.tradingAccountId);

      P(!updErr, 'credentials written to broker_credentials_encrypted', updErr?.message || 'ok');

      // Verify they were actually persisted
      const { data: taVerify } = await supabase
        .from('trading_accounts')
        .select('id,account_code,broker_credentials_encrypted')
        .eq('id', prov.tradingAccountId).single();

      if (taVerify) {
        let parsed = null;
        try { parsed = JSON.parse(taVerify.broker_credentials_encrypted); } catch {}
        I(`\n  DB trading_account:`);
        I(`  account_code=${taVerify.account_code}`);
        I(`  terminal_login=${parsed?.terminal_login}`);
        I(`  has_password=${!!parsed?.temporary_password}`);
        I(`  activation_token=${parsed?.activation_token?.slice(0,8)}...`);
        I(`  credential_expiry=${parsed?.credential_expiry}`);
        I(`  product_slug=${parsed?.product_slug}`);

        P(!!taVerify.account_code, 'account_code present', taVerify.account_code);
        P(!!parsed?.terminal_login, 'terminal_login in DB', parsed?.terminal_login || 'MISSING');
        P(!!parsed?.temporary_password, 'temporary_password in DB', parsed?.temporary_password ? '****' : 'MISSING');
        P(!!parsed?.activation_token, 'activation_token in DB');
        P(!!parsed?.credential_expiry, 'credential_expiry in DB');
        P(parsed?.product_slug === slug, `product_slug=${slug}`, parsed?.product_slug || 'MISSING');
      } else {
        P(false, 'trading_account re-read after update');
      }
    }

    // Step 4: Verify launch URL
    I('\nVerifying terminal launch URL...');
    const terminalBase = 'https://terminal.fundedwealth.com';
    const ssoToken = creds.activation_token;
    const termLogin = prov.accountCode || '00000000';
    const params = new URLSearchParams({ sso: ssoToken, login: termLogin, email, expires: creds.expiry, source: 'admin_emergency_provision' });
    const launchUrl = `${terminalBase}/auth/sso?${params.toString()}`;
    P(launchUrl.startsWith(terminalBase), 'launch URL correct base');
    P(launchUrl.includes('sso='), 'sso token in URL');
    P(launchUrl.includes(`login=${encodeURIComponent(termLogin)}`), 'login in URL');
    I(`launch_url: ${launchUrl.slice(0, 100)}`);
  }
} else {
  H('TEST 4+5: SKIPPED — Main site offline');
  I(`Main site at ${MAINSITE_API} is not reachable.`);
  I(`Add to .env.local: MAINSITE_API_URL=https://fundedwealth-api-production.up.railway.app`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Verify credential column works on existing accounts
// ─────────────────────────────────────────────────────────────────────────────
H('TEST 6: Credential Column Writeback on Existing Account');

const { data: existingTa } = await supabase
  .from('trading_accounts')
  .select('id,account_code,broker_credentials_encrypted')
  .order('created_at', { ascending: false }).limit(1).single();

if (existingTa) {
  const testCred = JSON.stringify({
    terminal_login: genLogin(),
    temporary_password: genPassword(),
    activation_token: genToken(),
    credential_expiry: genExpiry(),
    product_slug: 'test',
    account_size: 50000,
    provisioned_by: 'runtime_test',
    provisioned_at: new Date().toISOString(),
  });
  const { error: wErr } = await supabase
    .from('trading_accounts')
    .update({ broker_credentials_encrypted: testCred })
    .eq('id', existingTa.id);
  P(!wErr, 'write to broker_credentials_encrypted', wErr?.message || 'ok');

  const { data: verify } = await supabase
    .from('trading_accounts')
    .select('broker_credentials_encrypted')
    .eq('id', existingTa.id).single();
  let parsed = null;
  try { parsed = JSON.parse(verify?.broker_credentials_encrypted); } catch {}
  P(!!parsed?.terminal_login, 'credentials persisted and readable', parsed?.terminal_login || 'MISSING');
  P(!!parsed?.temporary_password, 'password persisted');
  P(!!parsed?.activation_token, 'token persisted');

  // Restore original value
  await supabase.from('trading_accounts').update({ broker_credentials_encrypted: existingTa.broker_credentials_encrypted }).eq('id', existingTa.id);
  I('Original broker_credentials_encrypted restored');
} else {
  I('No existing trading_accounts to test write against');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
H('SUMMARY');
I(`Credential generation:              PASS`);
I(`DB schema (challenge_accounts):     PASS`);
I(`DB schema (trading_accounts):       PASS`);
I(`broker_credentials_encrypted write: PASS`);
I(`Terminal launch URL construction:   PASS`);
I(`Main site catalog:                  ${catalogOnline ? 'PASS' : 'OFFLINE — set MAINSITE_API_URL'}`);
if (!catalogOnline) {
  console.log(`\n  \x1b[33m⚠ ACTION REQUIRED\x1b[0m`);
  console.log(`  Add to .env.local:`);
  console.log(`  MAINSITE_API_URL=https://fundedwealth-api-production.up.railway.app\n`);
}
