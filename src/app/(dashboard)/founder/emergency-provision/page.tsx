'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, UserPlus, Copy, CheckCircle, AlertTriangle, Mail } from 'lucide-react';

/**
 * Emergency Manual Provision — Founder-only.
 * Provisions a trading account WITHOUT requiring a historical order.
 * Creates user (if needed), challenge_account, trading_account, provisioning_logs, audit entry.
 * Sends credentials by email and displays them on screen.
 */

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
  email_sent: boolean;
  user_created: boolean;
  provisioned_at: string;
}

const ACCOUNT_SIZES = [25000, 50000, 100000, 200000, 500000, 1000000];

export default function EmergencyManualProvisionPage() {
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [challengeType, setChallengeType] = useState<'evaluation' | 'express' | 'stellar'>('evaluation');
  const [accountSize, setAccountSize] = useState<number>(50000);
  const [customSize, setCustomSize] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    const finalSize = customSize ? Number(customSize) : accountSize;
    if (!name.trim()) { setError('Name is required'); return; }
    if (!email.trim()) { setError('Email is required'); return; }
    if (!finalSize || finalSize <= 0) { setError('Account size must be positive'); return; }

    setSubmitting(true);

    try {
      const res = await fetch('/api/founder/emergency-provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          challenge_type: challengeType,
          account_size: finalSize,
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
Challenge: ${result.challenge_type}
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
    setChallengeType('evaluation');
    setAccountSize(50000);
    setCustomSize('');
    setResult(null);
    setError('');
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
          Use when order data no longer exists.
        </p>
      </div>

      {/* Warning Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-destructive">This action is audited and irreversible.</p>
          <p className="text-muted-foreground">
            A new account will be created immediately. Credentials are emailed to the user
            and displayed here. Duplicate emails with active accounts are blocked.
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
                <p className="font-medium capitalize">{result.challenge_type}</p>
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

              {/* Challenge Type */}
              <div>
                <label htmlFor="ep-challenge" className="block text-sm font-medium mb-1.5">
                  Challenge <span className="text-destructive">*</span>
                </label>
                <select
                  id="ep-challenge"
                  value={challengeType}
                  onChange={(e) => setChallengeType(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="evaluation">Evaluation</option>
                  <option value="express">Express</option>
                  <option value="stellar">Stellar</option>
                </select>
              </div>

              {/* Account Size */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Account Size <span className="text-destructive">*</span>
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {ACCOUNT_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => { setAccountSize(size); setCustomSize(''); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        accountSize === size && !customSize
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent border-border'
                      }`}
                    >
                      ₹{size.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={customSize}
                  onChange={(e) => setCustomSize(e.target.value)}
                  placeholder="Or enter custom size..."
                  min="1"
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
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
                disabled={submitting}
                className="w-full gap-2"
                variant="default"
              >
                <UserPlus className="h-4 w-4" />
                {submitting ? 'Provisioning...' : 'Provision Account'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
