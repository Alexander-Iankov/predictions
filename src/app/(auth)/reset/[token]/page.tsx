import Link from 'next/link';
import { isResetTokenValid } from '@/lib/auth/actions';
import { Banner, Card, CardHeader } from '@/components/ui';
import { ResetForm } from './reset-form';

export const metadata = { title: 'Нова парола — Прогнози U-17' };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isResetTokenValid(token);

  return (
    <Card>
      <CardHeader title="Нова парола" />
      <div className="flex flex-col gap-4 p-5">
        {valid ? (
          <ResetForm token={token} />
        ) : (
          <>
            <Banner kind="error">Линкът е изтекъл или вече е използван.</Banner>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <Link href="/forgot" className="font-medium text-brand hover:underline">
                Поискай нов линк
              </Link>
              <Link href="/login" className="text-muted hover:text-brand">
                Към входа
              </Link>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
