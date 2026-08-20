import Link from 'next/link';
import { Banner, Card, CardHeader } from '@/components/ui';

export const metadata = { title: 'Чака одобрение — Прогнози U-17' };

export default function PendingPage() {
  return (
    <Card>
      <CardHeader title="Профилът чака одобрение" />
      <div className="flex flex-col gap-4 p-5">
        <Banner kind="info">
          Админът трябва да одобри профила, преди да можеш да правиш прогнози. Пробвай пак по-късно.
        </Banner>
        <Link href="/" className="text-sm text-brand hover:underline">
          Към началото
        </Link>
      </div>
    </Card>
  );
}
