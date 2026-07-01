'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { Shield, UserPlus, Copy, CheckCircle, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

/**
 * Emergency Manual Provision — Founder-only.
 * Displays terminal login credentials after provisioning.
 * Handles existing accounts with management actions.
 */

interface ChallengeProductSize {
  accountSize: number;
  sizeLabel: string;
  fee: number;
  popular: boolean;
}

interface ChallengeProduct {
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
  sizes: ChallengeProductSize[];
  accountSizes: number[];
}

interface ProvisionResult {
  user_id: string;
  user_email: string;
  user_name: string;
  challenge_account_id: string;
  trading_account_id: string | null;
  terminal_login_id: string;
  terminal_email: string;
  terminal_url: string;
  account_size: number;
  challenge_type: string;
  challenge_display_name: string;
  phases: number;
  profit_target: string;
  daily_loss: string;
  max_loss: string;
  min_days: string;
  leverage: string;
  profit_split: string;
  duration: string;
  user_created: boolean;
  provisioned_at: string;
}

interface ExistingAccountData {
  user_id: string;
  user_email: string;
  user_name: string;
  trading_account_id: string;
  terminal_login_id: string;
  terminal_email: string;
  terminal_url: string;
  account_size: number;
  challenge_type: string;
  status: string;
}

export default function EmergencyManualProvisionPage() {
  const [products, setProducts] = useState<ChallengeProduct[]>([]);
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

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    setProductsLoading(true);
    setProductsError('');
    try {
      const res = await apiFetch('/api/founder/emergency-provision', { credentials: 'include' });
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
  }

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

  function copyCredentials() {
    if (!result) return;
    const text = [
      'FundedWealth — Terminal Credentials',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `Name:              ${result.user_name}`,
      `Email:             ${result.user_email}`,
      `Terminal Login ID: ${result.terminal_login_id}`,
      `Terminal Email:    ${result.terminal_email}`,
      `Terminal URL:      ${result.terminal_url}`,
      `Account Size:      ₹${result.account_size.toLocaleString()}`,
      `Challenge:         ${result.challenge_display_name}`,
      `Leverage:          ${result.leverage}`,
      `Profit Target:     ${result.profit_target}`,
      `Daily Loss Limit:  ${result.daily_loss}`,
      `Max Loss Limit:    ${result.max_loss}`,
      `Profit Split:      ${result.profit_split}`,
      `Duration:          ${result.duration}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'Password: Sent by platform to trader email on first login.',
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  function copyExistingLogin() {
    if (!existingAccount) return;
    const text = [
      'FundedWealth — Existing Terminal Account',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `Name:              ${existingAccount.user_name}`,
      `Email:             ${existingAccount.user_email}`,
      `Terminal Login ID: ${existingAccount.terminal_login_id}`,
      `Terminal Email:    ${existingAccount.terminal_email}`,
      `Terminal URL:      ${existingAccount.terminal_url}`,
      `Challenge:         ${existingAccount.challenge_type}`,
      `Account Size:      ₹${existingAccount.account_size?.toLocaleString() ?? '—'}`,
      `Status:            ${existingAccount.status}`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  function resetForm() {
    setName(''); setEmail(''); setPhone('');
    setResult(null); setExistingAccount(null); setError('');
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
          Founder-only. Provision a trading account without requiring a historical order.
          Uses the same pipeline as the production website checkout.
        </p>
      </div>

      {/* Warning Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-destructive">This action is audited and irreversible.</p>
          <p className="text-muted-foreground">
            Account parameters (drawdown, profit target, leverage, payout) are identical to a normal purchase.
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

            {/* Terminal Credentials — prominent section */}
            <div className="rounded-lg border border-green-400/40 bg-white dark:bg-green-950/30 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-400">
                Terminal Access Credentials
              </p>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Terminal Login ID</span>
                  <span className="font-bold font-mono text-base">{result.terminal_login_id}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Terminal Email</span>
                  <span className="font-medium">{result.terminal_email}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Terminal URL</span>
                  <a href={result.terminal_url} target="_blank" rel="noreferrer"
                    className="font-medium text-primary flex items-center gap-1 hover:underline">
                    {result.terminal_url} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Password</span>
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    Sent by platform to trader email on first login
                  </span>
                </div>
              </div>
            </div>

            {/* Account Details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Trader Name</p>
                <p className="font-medium">{result.user_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Trader Email</p>
                <p className="font-medium">{result.user_email}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Account Size</p>
                <p className="font-medium">₹{result.account_size.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Challenge</p>
                <p className="font-medium">{result.challenge_display_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Leverage</p>
                <p className="font-medium">{result.leverage}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Profit Target</p>
                <p className="font-medium">{result.profit_target}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Daily Loss</p>
                <p className="font-medium">{result.daily_loss}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Max Loss</p>
                <p className="font-medium">{result.max_loss}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Profit Split</p>
                <p className="font-medium">{result.profit_split}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="font-medium">{result.duration}</p>
              </div>
              <div>
                <p className="text-muted-foreground">User</p>
                <p className="font-medium">{result.user_created ? 'New user created' : 'Existing user'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Provisioned</p>
                <p className="font-medium text-xs">{new Date(result.provisioned_at).toLocaleString()}</p>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={copyCredentials} variant="default" className="gap-2">
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy All Credentials'}
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
              This email already has an active trading account. Use the actions below to manage it.
            </p>

            <div className="rounded-lg border border-amber-400/40 bg-white dark:bg-amber-950/30 p-4 space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Terminal Login ID</span>
                <span className="font-bold font-mono">{existingAccount.terminal_login_id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Terminal Email</span>
                <span className="font-medium">{existingAccount.terminal_email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Terminal URL</span>
                <a href={existingAccount.terminal_url} target="_blank" rel="noreferrer"
                  className="font-medium text-primary flex items-center gap-1 hover:underline">
                  {existingAccount.terminal_url} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Challenge</span>
                <span className="font-medium uppercase">{existingAccount.challenge_type}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{existingAccount.status}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={copyExistingLogin} variant="default" className="gap-2">
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Login Details'}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => window.open(existingAccount.terminal_url, '_blank')}
              >
                <ExternalLink className="h-4 w-4" /> Open Terminal
              </Button>
              <Button
                variant="outline"
                className="gap-2 text-amber-700 border-amber-400 hover:bg-amber-50"
                onClick={resetForm}
              >
                <RefreshCw className="h-4 w-4" /> Try Different Email
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── FORM ── */}
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

              {/* Challenge Type */}
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

                {/* Product detail grid — uses production marketing strings, no hardcoded values */}
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
                    </div>
                  </div>
                )}
              </div>

              {/* Account Size — size labels come from production catalog */}
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

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              {/* Submit */}
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
