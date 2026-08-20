import Link from 'next/link';
import { Banner, Card, CardHeader } from '@/components/ui';

export const metadata = { title: 'Блокиран профил — Прогнози U-17' };

export default function BlockedPage() {
  return (
    <Card>
      <CardHeader title="Профилът е блокиран" />
      <div className="flex flex-col gap-4 p-5">
        <Banner kind="error">
          Профилът е блокиран от админа. Ако смяташ, че е грешка, свържи се с него.
        </Banner>
        <Link href="/" className="text-sm text-brand hover:underline">
          Към началото
        </Link>
      </div>
    </Card>
  );
}
