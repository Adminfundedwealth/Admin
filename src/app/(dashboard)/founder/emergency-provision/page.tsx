'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { Shield, UserPlus, Copy, CheckCircle, AlertTriangle, Mail } from 'lucide-react';

/**
 * Emergency Manual Provision — Founder-only.
 * Loads challenge products from the same production configuration.
 * Uses the shared provisioning pipeline (identical to website checkout).
 */

interface ChallengeProduct {
  slug: string;
  displayName: string;
  accountSizes: number[];
  phases: number;
  profitTargetPct: number;
  dailyDrawdownLimitPct: number;
  maxDrawdownLimitPct: number;
  minTradingDays: number;
  maxTradingDays: number | null;
  leverage: string;
  platform: string;
  profitSplitPct: number;
  payoutSchedule: string;
}

interface ProvisionResult {
  user_id: string;
  user_email: string;
  user_name: string;
  challenge_account_id: string;
  trading_account_id: string | null;
  login_id: string;
  password: string;
  account_size: number;
  challenge_type: string;
  challenge_display_name: string;
  phases: number;
  profit_target_pct: number;
  daily_drawdown_limit_pct: number;
  max_drawdown_limit_pct: number;
  leverage: string;
  platform: string;
  profit_split_pct: number;
  payout_schedule: string;
  email_sent: boolean;
  user_created: boolean;
  provisioned_at: string;
}

export default function EmergencyManualProvisionPage() {
  // Products loaded from production config
  const [products, setProducts] = useState<ChallengeProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [accountSize, setAccountSize] = useState<number>(0);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Load products from production config on mount
  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setProductsLoading(true);
    setProductsError('');
    try {
      const res = await fetch('/api/founder/emergency-provision');
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Failed to load products');
      }
      const json = await res.json();
      setProducts(json.products || []);
      // Select first product by default
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
    if (product) {
      setAccountSize(product.accountSizes[0]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!name.trim()) { setError('Name is required'); return; }
    if (!email.trim()) { setError('Email is required'); return; }
    if (!selectedProduct) { setError('Challenge type is required'); return; }
    if (!accountSize || accountSize <= 0) { setError('Account size is required'); return; }

    setSubmitting(true);

    try {
      const res = await fetch('/api/founder/emergency-provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          challenge_type: selectedProduct,
          account_size: accountSize,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || 'Provisioning failed');
        return;
      }

      setResult(json.data);
    } catch {
      setError('Network error. Please check if the account was created before retrying.');
    } finally {
      setSubmitting(false);
    }
  }

  function copyCredentials() {
    if (!result) return;
    const text = `FundedWealth Trading Account Credentials
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${result.user_name}
Email: ${result.user_email}
Login ID: ${result.login_id}
Password: ${result.password}
Account Size: ₹${result.account_size.toLocaleString()}
Challenge: ${result.challenge_display_name}
Platform: ${result.platform}
Leverage: ${result.leverage}
Profit Target: ${result.profit_target_pct}%
Daily Drawdown: ${result.daily_drawdown_limit_pct}%
Max Drawdown: ${result.max_drawdown_limit_pct}%
Profit Split: ${result.profit_split_pct}%
Payout: ${result.payout_schedule}
Terminal: https://terminal.fundedwealth.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  function resetForm() {
    setName('');
    setEmail('');
    setPhone('');
    if (products.length > 0) {
      setSelectedProduct(products[0].slug);
      setAccountSize(products[0].accountSizes[0]);
    }
    setResult(null);
    setError('');
  }

  if (productsLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-7 w-7 text-destructive" />
            Emergency Manual Provision
          </h1>
        </div>
        <LoadingState rows={4} />
      </div>
    );
  }

  if (productsError) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-7 w-7 text-destructive" />
            Emergency Manual Provision
          </h1>
        </div>
        <div className="flex items-center gap-2 p-4 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {productsError}
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
          <Shield className="h-7 w-7 text-destructive" />
          Emergency Manual Provision
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
            Account parameters (drawdown, profit target, leverage, payout) are identical
            to a normal purchase. Duplicate emails with active accounts are blocked.
          </p>
        </div>
      </div>

      {/* Success Result */}
      {result && (
        <Card className="border-green-500/50 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-5 w-5" />
              <h3 className="font-bold text-lg">Account Provisioned Successfully</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">{result.user_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium">{result.user_email}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Login ID</p>
                <p className="font-bold font-mono text-base">{result.login_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Password</p>
                <p className="font-bold font-mono text-base">{result.password}</p>
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
                <p className="text-muted-foreground">Platform</p>
                <p className="font-medium">{result.platform}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Leverage</p>
                <p className="font-medium">{result.leverage}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Profit Target</p>
                <p className="font-medium">{result.profit_target_pct}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Daily Drawdown</p>
                <p className="font-medium">{result.daily_drawdown_limit_pct}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Max Drawdown</p>
                <p className="font-medium">{result.max_drawdown_limit_pct}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Profit Split</p>
                <p className="font-medium">{result.profit_split_pct}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Payout Schedule</p>
                <p className="font-medium capitalize">{result.payout_schedule}</p>
              </div>
              <div>
                <p className="text-muted-foreground">User Status</p>
                <p className="font-medium">{result.user_created ? 'New user created' : 'Existing user'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email Sent</p>
                <p className="font-medium flex items-center gap-1">
                  {result.email_sent ? (
                    <><Mail className="h-3.5 w-3.5 text-green-600" /> Yes</>
                  ) : (
                    <><AlertTriangle className="h-3.5 w-3.5 text-yellow-600" /> Failed — share manually</>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={copyCredentials} variant="default" className="gap-2">
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Credentials'}
              </Button>
              <Button onClick={resetForm} variant="outline">
                Provision Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      {!result && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div>
                <label htmlFor="ep-name" className="block text-sm font-medium mb-1.5">
                  Full Name <span className="text-destructive">*</span>
                </label>
                <input
                  id="ep-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  required
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="ep-email" className="block text-sm font-medium mb-1.5">
                  Email <span className="text-destructive">*</span>
                </label>
                <input
                  id="ep-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@example.com"
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  required
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="ep-phone" className="block text-sm font-medium mb-1.5">
                  Phone <span className="text-muted-foreground text-xs">(optional)</span>
                </label>
                <input
                  id="ep-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Challenge Type — loaded from production config */}
              <div>
                <label htmlFor="ep-challenge" className="block text-sm font-medium mb-1.5">
                  Challenge <span className="text-destructive">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {products.map((product) => (
                    <button
                      key={product.slug}
                      type="button"
                      onClick={() => handleProductChange(product.slug)}
                      className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                        selectedProduct === product.slug
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent border-border'
                      }`}
                    >
                      {product.displayName}
                    </button>
                  ))}
                </div>
                {currentProduct && (
                  <div className="mt-2 p-3 rounded-md bg-muted/50 text-xs space-y-1">
                    <div className="grid grid-cols-3 gap-2">
                      <span>Profit Target: <strong>{currentProduct.profitTargetPct}%</strong></span>
                      <span>Daily DD: <strong>{currentProduct.dailyDrawdownLimitPct}%</strong></span>
                      <span>Max DD: <strong>{currentProduct.maxDrawdownLimitPct}%</strong></span>
                      <span>Min Days: <strong>{currentProduct.minTradingDays}</strong></span>
                      <span>Max Days: <strong>{currentProduct.maxTradingDays ?? '∞'}</strong></span>
                      <span>Phases: <strong>{currentProduct.phases}</strong></span>
                      <span>Leverage: <strong>{currentProduct.leverage}</strong></span>
                      <span>Platform: <strong>{currentProduct.platform}</strong></span>
                      <span>Split: <strong>{currentProduct.profitSplitPct}%</strong></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Account Size — from product config */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Account Size <span className="text-destructive">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {(currentProduct?.accountSizes || []).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setAccountSize(size)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        accountSize === size
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent border-border'
                      }`}
                    >
                      ₹{size.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={submitting || !selectedProduct || !accountSize}
                className="w-full gap-2"
                variant="default"
              >
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
