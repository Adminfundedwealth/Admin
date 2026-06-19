'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TwoFactorPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
      <TwoFactorForm />
    </Suspense>
  );
}

function TwoFactorForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const challengeToken = searchParams.get('token');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, challengeToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (data.error?.code === 'ACCOUNT_LOCKED') {
          setError('Account locked due to too many failed attempts. Please wait 15 minutes.');
        } else {
          setError(`Invalid code. ${3 - newAttempts} attempt${3 - newAttempts !== 1 ? 's' : ''} remaining.`);
        }
        setCode('');
        setLoading(false);
        return;
      }

      // 2FA verified successfully
      router.push('/executive');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(value: string) {
    // Only allow digits, max 6
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
  }

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Enter the 6-digit code from your authenticator app
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="totp-code" className="text-sm font-medium">
              Verification Code
            </label>
            <Input
              id="totp-code"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="000000"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              maxLength={6}
              required
              autoComplete="one-time-code"
              disabled={loading || attempts >= 3}
              className="text-center text-2xl tracking-[0.5em] font-mono"
            />
            <p className="text-xs text-muted-foreground text-center">
              Code is valid for 60 seconds
            </p>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading || code.length !== 6 || attempts >= 3}
          >
            {loading ? 'Verifying...' : 'Verify'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => router.push('/login')}
          >
            Back to Login
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
