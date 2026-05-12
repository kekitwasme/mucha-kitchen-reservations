'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [csrfToken, setCsrfToken] = useState('');

  const callbackUrl = searchParams.get('callbackUrl') || '/staff';
  const urlError = searchParams.get('error');

  useEffect(() => {
    // Fetch CSRF token on mount - MUST include cookies
    fetch('/api/auth/csrf', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setCsrfToken(data.csrfToken))
      .catch(() => setError('Failed to initialize login'));
  }, []);

  useEffect(() => {
    if (urlError) {
      setError(
        urlError === 'CredentialsSignin'
          ? 'Invalid credentials'
          : `Login error: ${urlError}`
      );
    }
  }, [urlError]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex flex-col items-center gap-3">
            <Image src="/logo.png" alt="Mucha Kitchen" width={48} height={48} className="h-12 w-12" />
            <CardTitle>Staff Login</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form action="/api/auth/callback/credentials" method="POST" className="space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                name="email"
                type="email"
                placeholder="staff@demo.com"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                name="password"
                type="password"
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={!csrfToken}>
              {csrfToken ? 'Sign In' : 'Loading...'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="h-64 w-full max-w-sm bg-white rounded-lg shadow animate-pulse" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
