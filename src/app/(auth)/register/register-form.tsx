'use client';

import { useActionState } from 'react';
import { registerAction, type AuthState } from '@/lib/auth/actions';
import { Banner, Button, Field, Input } from '@/components/ui';

const initial: AuthState = {};

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initial);

  if (state.ok) {
    return (
      <Banner kind="ok">
        Готово. Профилът е създаден и чака админът да го одобри — след това можеш да влезеш.
      </Banner>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Banner kind="error">{state.error}</Banner> : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Име">
          <Input name="firstName" autoComplete="given-name" required autoFocus />
        </Field>
        <Field label="Фамилия">
          <Input name="lastName" autoComplete="family-name" required />
        </Field>
      </div>

      <Field label="Имейл">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Парола" hint="Поне 8 знака.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Изпращане…' : 'Регистрирай се'}
      </Button>
    </form>
  );
}
