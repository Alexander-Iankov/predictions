'use client';

import { useActionState } from 'react';
import { requestPasswordResetAction, type AuthState } from '@/lib/auth/actions';
import { Banner, Button, Field, Input } from '@/components/ui';

const initial: AuthState = {};

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);

  if (state.ok) {
    return (
      <Banner kind="ok">
        Ако има профил с този имейл, вече е тръгнал линк за нова парола. Провери и папката със
        спам — линкът е валиден един час.
      </Banner>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Banner kind="error">{state.error}</Banner> : null}

      <Field label="Имейл">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Изпращане…' : 'Изпрати линк'}
      </Button>
    </form>
  );
}
