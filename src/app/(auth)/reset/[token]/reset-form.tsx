'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { resetPasswordAction, type AuthState } from '@/lib/auth/actions';
import { Banner, Button, Field, Input } from '@/components/ui';

const initial: AuthState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  if (state.ok) {
    return (
      <>
        <Banner kind="ok">Паролата е сменена.</Banner>
        <Link href="/login" className="text-sm text-brand hover:underline">
          Влез с новата парола
        </Link>
      </>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Banner kind="error">{state.error}</Banner> : null}
      <input type="hidden" name="token" value={token} />

      <Field label="Нова парола" hint="Поне 8 знака.">
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          autoFocus
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Запазване…' : 'Смени паролата'}
      </Button>
    </form>
  );
}
