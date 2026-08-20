import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { Card, CardHeader } from '@/components/ui';
import { RegisterForm } from './register-form';

export const metadata = { title: 'Регистрация — Прогнози U-17' };

export default async function RegisterPage() {
  const user = await currentUser();
  if (user?.status === 'active') redirect('/matches');

  return (
    <Card>
      <CardHeader
        title="Регистрация"
        subtitle="Двете имена се виждат от останалите участници — по тях се разбира чия е прогнозата."
      />
      <div className="p-5">
        <RegisterForm />
        <p className="mt-4 text-sm text-muted">
          Вече имаш профил?{' '}
          <Link href="/login" className="text-brand hover:underline">
            Влез
          </Link>
        </p>
      </div>
    </Card>
  );
}
