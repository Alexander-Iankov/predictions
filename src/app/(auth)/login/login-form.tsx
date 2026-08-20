'use client';

import { useActionState } from 'react';
import { loginAction, type AuthState } from '@/lib/auth/actions';
import { Banner, Button, Field, Input } from '@/components/ui';

const initial: AuthState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Banner kind="error">{state.error}</Banner> : null}

      <Field label="Имейл">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>

      <Field label="Парола">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Влизане…' : 'Влез'}
      </Button>
    </form>
  );
}
