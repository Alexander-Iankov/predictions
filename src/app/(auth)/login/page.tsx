import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { Card, CardHeader } from '@/components/ui';
import { LoginForm } from './login-form';

export const metadata = { title: 'Вход — Прогнози U-17' };

export default async function LoginPage() {
  const user = await currentUser();
  if (user?.status === 'active') redirect('/matches');

  return (
    <Card>
      <CardHeader title="Вход" subtitle="С имейла и паролата, с които си се регистрирал." />
      <div className="p-5">
        <LoginForm />

        <div className="mt-4 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px] text-muted">
          <span>
            Още нямаш профил?{' '}
            <Link href="/register" className="font-medium text-brand hover:underline">
              Регистрирай се
            </Link>
          </span>
          <Link href="/forgot" className="font-medium text-brand hover:underline">
            Забравена парола?
          </Link>
        </div>
      </div>
    </Card>
  );
}
