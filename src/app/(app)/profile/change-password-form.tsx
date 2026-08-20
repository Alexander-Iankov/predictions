'use client';

import { useActionState } from 'react';
import { changePasswordAction, type AuthState } from '@/lib/auth/actions';
import { Banner, Button, Field, Input } from '@/components/ui';

const initial: AuthState = {};

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      {state.ok ? <Banner kind="ok">Паролата е сменена.</Banner> : null}
      {state.error ? <Banner kind="error">{state.error}</Banner> : null}

      <Field label="Текуща парола">
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>

      <Field label="Нова парола" hint="Поне 8 знака.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Запазване…' : 'Смени паролата'}
      </Button>
    </form>
  );
}
