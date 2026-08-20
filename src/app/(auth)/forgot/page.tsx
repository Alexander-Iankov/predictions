import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui';
import { ForgotForm } from './forgot-form';

export const metadata = { title: 'Забравена парола — Прогнози U-17' };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader
        title="Забравена парола"
        subtitle="Пиши имейла си и ще получиш линк за нова парола."
      />
      <div className="p-5">
        <ForgotForm />
        <p className="mt-4 text-[13px] text-muted">
          Сети ли се?{' '}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Към входа
          </Link>
        </p>
      </div>
    </Card>
  );
}
