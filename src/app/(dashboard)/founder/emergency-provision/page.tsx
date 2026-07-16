'use client';

import { apiFetch } from '@/lib/api/fetch';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import {
  Shield, UserPlus, Copy, CheckCircle, AlertTriangle,
  RefreshCw, Terminal, Eye, EyeOff,
} from 'lucide-react';

interface CatalogSize {
  accountSize: number;
  sizeLabel: string;
  fee: number;
  popular: boolean;
}

interface CatalogProduct {
  slug: string;
  displayName: string;
  profitTarget: string;
  maxLoss: string;
  dailyLoss: string;
  minDays: string;
  leverage: string;
  profitSplit: string;
  duration: string;
  phases: number;
  rules: {
    profitTargetPct: number;
    dailyLossLimitPct: number;
    maxDrawdownPct: number;
    minTradingDays: number;
    maxDaysAllowed: number;
    type: string;
  };
  sizes: CatalogSize[];
  accountSizes: number[];
}

interface StoredRules {
  type: string;
  plan: string;
  initial_balance: number;
  profit_target_pct: number;
  daily_loss_limit_pct: number;
  max_drawdown_pct: number;
  min_trading_days: number;
  max_calendar_days: number;
  status: string;
}

interface VerificationChecks {
  product_preserved: boolean;
  balance_correct: boolean;
  credentials_ready: boolean;
  launch_url_built: boolean;
}

interface Verification {
  provisioned_slug: string;
  stored_type: string | null;
  stored_plan: string | null;
  stored_initial_balance: number | null;
  catalog_profit_target_pct: number;
  catalog_daily_loss_pct: number;
  catalog_max_drawdown_pct: number;
  credentials_generated: boolean;
  terminal_login_set: boolean;
  checks: VerificationChecks;
}

interface ProvisionResult {
  user_id: string;
  user_email: string;
  user_name: string;
  challenge_account_id: string;
  trading_account_id: string | null;
  // BUG 2: Full credentials
  terminal_login: string;
  terminal_email: string;
  temporary_password: string;
  activation_token: string;
  credential_expiry: string;
  // BUG 4: Launch URL
  terminal_url: string;
  launch_url: string;
  // BUG 1: Exact product values
  account_size: number;
  challenge_type: string;
  challenge_display_name: string;
  profit_target: string;
  daily_loss: string;
  max_loss: string;
  min_days: string;
  leverage: string;
  profit_split: string;
  duration: string;
  // BUG 3: Stored rules from DB
  stored_rules: StoredRules | null;
  // BUG 5: Verification
  verification: Verification;
  user_created: boolean;
  provisioned_at: string;
}

interface ExistingAccountData {
  user_id: string;
  user_email: string;
  user_name: string;
  trading_account_id: string;
  terminal_login: string;
  terminal_email: string;
  terminal_url: string;
  account_size: number;
  challenge_type: string;
  status: string;
}

export default function EmergencyManualProvisionPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [accountSize, setAccountSize] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [existingAccount, setExistingAccount] = useState<ExistingAccountData | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedExisting, setCopiedExisting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError('');
    try {
      const res = await apiFetch('/api/founder/emergency-provision');
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Failed to load products');
      }
      const json = await res.json();
      setProducts(json.products || []);
      if (json.products?.length > 0) {
        setSelectedProduct(json.products[0].slug);
        setAccountSize(json.products[0].accountSizes[0]);
      }
    } catch (err) {
      setProductsError(err instanceof Error ? err.message : 'Failed to load challenge products');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const currentProduct = products.find((p) => p.slug === selectedProduct);

  function handleProductChange(slug: string) {
    setSelectedProduct(slug);
    const product = products.find((p) => p.slug === slug);
    if (product) setAccountSize(product.accountSizes[0]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setExistingAccount(null);

    if (!name.trim()) { setError('Name is required'); return; }
    if (!email.trim()) { setError('Email is required'); return; }
    if (!selectedProduct) { setError('Challenge type is required'); return; }
    if (!accountSize) { setError('Account size is required'); return; }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/founder/emergency-provision', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          challenge_type: selectedProduct,
          account_size: accountSize,
        }),
      });

      const json = await res.json();

      if (res.status === 409 && json.existing_account) {
        setExistingAccount({ ...json.data, user_name: name.trim() });
        return;
      }
      if (!res.ok) {
        setError(json.error?.message || 'Provisioning failed');
        return;
      }
      setResult(json.data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Launch terminal — uses SSO endpoint when trading_account_id is available,
  // falls back to direct terminal URL when it is null (e.g. existing account lookup)
  async function handleLaunchTerminal(
    tradingAccountId: string | null,
    loginEmail: string,
    terminalLogin: string,
  ) {
    setLaunching(true);
    setLaunchError('');
    try {
      // If we have no trading_account_id we can't call the SSO endpoint —
      // open the terminal login page directly instead.
      if (!tradingAccountId) {
        const base = process.env.NEXT_PUBLIC_TERMINAL_URL || 'https://terminal.fundedwealth.com';
        window.open(
          `${base}/login?login=${encodeURIComponent(terminalLogin)}&email=${encodeURIComponent(loginEmail)}`,
          '_blank',
          'noopener,noreferrer',
        );
        return;
      }

      const res = await apiFetch('/api/founder/terminal-launch', {
        method: 'POST',
        body: JSON.stringify({
          trading_account_id: tradingAccountId,
          email: loginEmail,
          terminal_login: terminalLogin,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLaunchError(json.error?.message || 'Failed to generate launch URL');
        return;
      }
      window.open(json.launch_url, '_blank', 'noopener,noreferrer');
    } catch {
      setLaunchError('Network error. Could not launch terminal.');
    } finally {
      setLaunching(false);
    }
  }

  function copyText(text: string, setFlag: (v: boolean) => void = setCopied) {
    navigator.clipboard.writeText(text);
    setFlag(true);
    setTimeout(() => setFlag(false), 3000);
  }

  function copyCredentials() {
    if (!result) return;
    const lines = [
      'FundedWealth — Terminal Credentials',
      '════════════════════════════════════',
      `Name:               ${result.user_name}`,
      `Login Email:        ${result.user_email}`,
      `Terminal Login:     ${result.terminal_login}`,
      `Temporary Password: ${result.temporary_password}`,
      `Activation Token:   ${result.activation_token}`,
      `Credential Expiry:  ${new Date(result.credential_expiry).toLocaleString()}`,
      `Terminal URL:       ${result.terminal_url}`,
      `Launch URL:         ${result.launch_url}`,
      '────────────────────────────────────',
      `Account Size:       ₹${result.account_size.toLocaleString()}`,
      `Challenge:          ${result.challenge_display_name}`,
      `Leverage:           ${result.leverage}`,
      `Profit Target:      ${result.profit_target}`,
      `Daily Loss Limit:   ${result.daily_loss}`,
      `Max Loss Limit:     ${result.max_loss}`,
      `Profit Split:       ${result.profit_split}`,
      `Duration:           ${result.duration}`,
    ];
    copyText(lines.join('\n'));
  }

  function resetForm() {
    setName(''); setEmail(''); setPhone('');
    setResult(null); setExistingAccount(null); setError(''); setLaunchError('');
    setShowPassword(false); setCopied(false); setCopiedExisting(false);
    if (products.length > 0) {
      setSelectedProduct(products[0].slug);
      setAccountSize(products[0].accountSizes[0]);
    }
  }

  if (productsLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-7 w-7 text-destructive" /> Emergency Manual Provision
        </h1>
        <LoadingState rows={4} />
      </div>
    );
  }

  if (productsError) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-7 w-7 text-destructive" /> Emergency Manual Provision
        </h1>
        <div className="flex items-center gap-2 p-4 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {productsError}
        </div>
        <Button onClick={loadProducts} variant="outline">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-7 w-7 text-destructive" /> Emergency Manual Provision
        </h1>
        <p className="text-muted-foreground mt-1">
          Founder-only. Provision accounts using exact product catalog values.
          Credentials are generated and displayed here — no separate login required.
        </p>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-destructive">Audited and irreversible.</p>
          <p className="text-muted-foreground">
            Exact product rules (drawdown, leverage, targets) are applied from the live catalog.
            No hardcoded defaults.
          </p>
        </div>
      </div>

      {/* ── SUCCESS RESULT ── */}
      {result && (
        <Card className="border-green-500/50 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-5 w-5" />
              <h3 className="font-bold text-lg">Account Provisioned Successfully</h3>
            </div>

            {/* BUG 2: Full terminal credentials — login email, terminal login, temp password */}
            <div className="rounded-lg border border-green-400/40 bg-white dark:bg-green-950/30 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-400 mb-3">
                Terminal Credentials
              </p>
              <CredRow label="Login Email" value={result.user_email} onCopy={() => copyText(result.user_email)} />
              <CredRow label="Terminal Login" value={result.terminal_login} onCopy={() => copyText(result.terminal_login)} mono />
              <div className="flex justify-between items-center py-1.5 border-b border-border/30">
                <span className="text-sm text-muted-foreground">Temporary Password</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">
                    {showPassword ? result.temporary_password : '••••••••••'}
                  </span>
                  <button onClick={() => setShowPassword((v) => !v)} className="text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => copyText(result.temporary_password)} className="text-muted-foreground hover:text-foreground">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <CredRow label="Activation Token" value={result.activation_token} onCopy={() => copyText(result.activation_token)} mono small />
              <CredRow
                label="Credential Expiry"
                value={new Date(result.credential_expiry).toLocaleString()}
              />
            </div>

            {/* BUG 1: Exact product values */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Account Size" value={`₹${result.account_size.toLocaleString()}`} />
              <InfoRow label="Challenge" value={result.challenge_display_name} />
              <InfoRow label="Leverage" value={result.leverage} />
              <InfoRow label="Profit Target" value={result.profit_target} />
              <InfoRow label="Daily Loss" value={result.daily_loss} />
              <InfoRow label="Max Loss" value={result.max_loss} />
              <InfoRow label="Profit Split" value={result.profit_split} />
              <InfoRow label="Duration" value={result.duration} />
              <InfoRow label="Min Days" value={result.min_days} />
              <InfoRow label="User" value={result.user_created ? 'New user created' : 'Existing user'} />
            </div>

            {/* BUG 3: DB verification — stored rules match catalog */}
            {result.stored_rules && (
              <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
                <p className="font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  DB Verification — Stored Rules
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span>Type: <strong>{result.stored_rules.type}</strong></span>
                  <span>Plan: <strong>{result.stored_rules.plan}</strong></span>
                  <span>Balance: <strong>₹{result.stored_rules.initial_balance?.toLocaleString()}</strong></span>
                  <span>Status: <strong>{result.stored_rules.status}</strong></span>
                  <span>Profit Target: <strong>{result.stored_rules.profit_target_pct}%</strong></span>
                  <span>Daily Loss: <strong>{result.stored_rules.daily_loss_limit_pct}%</strong></span>
                  <span>Max DD: <strong>{result.stored_rules.max_drawdown_pct}%</strong></span>
                  <span>Min Days: <strong>{result.stored_rules.min_trading_days}</strong></span>
                </div>
              </div>
            )}

            {/* BUG 5: Verification checks */}
            {result.verification?.checks && (
              <div className="rounded-md border border-border/50 p-3 text-xs space-y-1.5">
                <p className="font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  End-to-End Verification
                </p>
                <CheckLine label="Product type preserved" pass={result.verification.checks.product_preserved} />
                <CheckLine label="Balance correct" pass={result.verification.checks.balance_correct} />
                <CheckLine label="Credentials generated" pass={result.verification.checks.credentials_ready} />
                <CheckLine label="Launch URL built" pass={result.verification.checks.launch_url_built} />
              </div>
            )}

            {/* BUG 4: Launch Terminal button */}
            {launchError && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {launchError}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={copyCredentials} variant="default" className="gap-2">
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy All Credentials'}
              </Button>
              <Button
                onClick={() => handleLaunchTerminal(
                  result.trading_account_id,
                  result.terminal_email,
                  result.terminal_login,
                )}
                disabled={launching}
                variant="outline"
                className="gap-2"
              >
                <Terminal className="h-4 w-4" />
                {launching ? 'Launching...' : 'Launch Terminal'}
              </Button>
              <Button onClick={resetForm} variant="outline">Provision Another</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── EXISTING ACCOUNT ── */}
      {existingAccount && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-bold text-lg">Existing Terminal Account Detected</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              This email already has an active trading account.
            </p>
            <div className="rounded-lg border border-amber-400/40 bg-white dark:bg-amber-950/30 p-4 space-y-2 text-sm">
              <CredRow label="Login Email" value={existingAccount.user_email} onCopy={() => copyText(existingAccount.user_email)} />
              <CredRow label="Terminal Login" value={existingAccount.terminal_login} onCopy={() => copyText(existingAccount.terminal_login)} mono />
              <div className="flex justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground">Challenge</span>
                <span className="font-medium uppercase">{existingAccount.challenge_type}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{existingAccount.status}</span>
              </div>
            </div>
            {launchError && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {launchError}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => copyText([
                `Login Email:    ${existingAccount.user_email}`,
                `Terminal Login: ${existingAccount.terminal_login}`,
                `Challenge:      ${existingAccount.challenge_type}`,
                `Status:         ${existingAccount.status}`,
              ].join('\n'), setCopiedExisting)} variant="default" className="gap-2">
                {copiedExisting ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedExisting ? 'Copied!' : 'Copy Login Details'}
              </Button>
              <Button
                onClick={() => handleLaunchTerminal(
                  existingAccount.trading_account_id,
                  existingAccount.terminal_email,
                  existingAccount.terminal_login,
                )}
                disabled={launching}
                variant="outline"
                className="gap-2"
              >
                <Terminal className="h-4 w-4" />
                {launching ? 'Launching...' : 'Launch Terminal'}
              </Button>
              <Button onClick={resetForm} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" /> Try Different Email
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PROVISION FORM ── */}
      {!result && !existingAccount && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Name */}
              <div>
                <label htmlFor="ep-name" className="block text-sm font-medium mb-1.5">
                  Full Name <span className="text-destructive">*</span>
                </label>
                <input id="ep-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe" required
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="ep-email" className="block text-sm font-medium mb-1.5">
                  Email <span className="text-destructive">*</span>
                </label>
                <input id="ep-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@example.com" required
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="ep-phone" className="block text-sm font-medium mb-1.5">
                  Phone <span className="text-muted-foreground text-xs">(optional)</span>
                </label>
                <input id="ep-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              {/* Challenge Type — BUG 1: buttons map to catalog slugs exactly */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Challenge <span className="text-destructive">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {products.map((product) => (
                    <button key={product.slug} type="button" onClick={() => handleProductChange(product.slug)}
                      className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                        selectedProduct === product.slug
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent border-border'
                      }`}>
                      {product.displayName}
                    </button>
                  ))}
                </div>

                {/* Product rules preview — from catalog, no hardcoding */}
                {currentProduct && (
                  <div className="mt-2 p-3 rounded-md bg-muted/50 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                      <span>Profit Target: <strong>{currentProduct.profitTarget}</strong></span>
                      <span>Daily Loss: <strong>{currentProduct.dailyLoss}</strong></span>
                      <span>Max Loss: <strong>{currentProduct.maxLoss}</strong></span>
                      <span>Min Days: <strong>{currentProduct.minDays}</strong></span>
                      <span>Duration: <strong>{currentProduct.duration}</strong></span>
                      <span>Leverage: <strong>{currentProduct.leverage}</strong></span>
                      <span>Profit Split: <strong>{currentProduct.profitSplit}</strong></span>
                      <span>Type: <strong>{currentProduct.rules.type}</strong></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Account Size — from catalog sizes */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Account Size <span className="text-destructive">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {(currentProduct?.sizes || []).map((s) => (
                    <button key={s.accountSize} type="button" onClick={() => setAccountSize(s.accountSize)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        accountSize === s.accountSize
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent border-border'
                      }`}>
                      {s.sizeLabel}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              <Button type="submit" disabled={submitting || !selectedProduct || !accountSize}
                className="w-full gap-2" variant="default">
                <UserPlus className="h-4 w-4" />
                {submitting ? 'Provisioning...' : `Provision ${currentProduct?.displayName || ''} Account`}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CredRow({
  label,
  value,
  onCopy,
  mono = false,
  small = false,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/30">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`font-medium ${mono ? 'font-mono' : ''} ${small ? 'text-xs' : 'text-sm'}`}>
          {value}
        </span>
        {onCopy && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-foreground shrink-0">
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
}

function CheckLine({ label, pass }: { label: string; pass: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {pass
        ? <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
        : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
      <span className={pass ? 'text-green-700 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
        {label}
      </span>
    </div>
  );
}
