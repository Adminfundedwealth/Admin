'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TwoFactorSetupPage() {
  return (
    <Suspense fallback={<Card className="w-full"><CardContent className="p-6 text-center"><p className="text-muted-foreground">Loading...</p></CardContent></Card>}>
      <TwoFactorSetupContent />
    </Suspense>
  );
}

function TwoFactorSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setupToken = searchParams.get('token');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'loading' | 'scan' | 'verify'>('loading');

  useEffect(() => {
    async function initSetup() {
      if (!setupToken) {
        setError('Missing setup token. Please log in again.');
        return;
      }

      try {
        const res = await fetch('/api/auth/2fa/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setupToken }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error?.message || 'Failed to initialize 2FA setup');
          return;
        }

        setQrCodeUrl(data.qrCodeUrl);
        setSecret(data.secret);
        setStep('scan');
      } catch {
        setError('Failed to initialize 2FA setup');
      }
    }

    initSetup();
  }, [setupToken]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/2fa/setup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, secret, setupToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Invalid verification code');
        setCode('');
        setLoading(false);
        return;
      }

      // 2FA setup complete — redirect to dashboard
      router.push('/executive');
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(value: string) {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
  }

  if (step === 'loading') {
    return (
      <Card className="w-full">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Setting up two-factor authentication...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Set Up 2FA
        </CardTitle>
        <CardDescription>
          Two-factor authentication is required for all staff accounts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        {step === 'scan' && (
          <>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                1. Install an authenticator app (Google Authenticator, Authy, etc.)
              </p>
              <p className="text-sm text-muted-foreground">
                2. Scan the QR code below or enter the secret key manually
              </p>
            </div>

            {qrCodeUrl && (
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <QRCodeSVG value={qrCodeUrl} size={192} level="M" />
              </div>
            )}

            {secret && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Manual entry key:</p>
                <code className="block w-full p-2 bg-muted rounded text-xs text-center font-mono break-all select-all">
                  {secret}
                </code>
              </div>
            )}

            <Button className="w-full" onClick={() => setStep('verify')}>
              I&apos;ve Scanned the Code
            </Button>
          </>
        )}

        {step === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="verify-code" className="text-sm font-medium">
                Enter the 6-digit code from your authenticator app
              </label>
              <Input
                id="verify-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="000000"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                maxLength={6}
                required
                autoComplete="one-time-code"
                disabled={loading}
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
              {loading ? 'Verifying...' : 'Complete Setup'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setStep('scan')}
            >
              Back to QR Code
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
