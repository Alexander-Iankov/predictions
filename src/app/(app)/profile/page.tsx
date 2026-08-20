import Link from 'next/link';
import { requireUser } from '@/lib/auth/guards';
import { getProfile, getProfileStats } from '@/lib/queries/profile';
import { formatSofiaDateTime } from '@/lib/time';
import { ChangePasswordForm } from './change-password-form';
import { Badge, Card, CardHeader, PageTitle, Stat } from '@/components/ui';

export const metadata = { title: 'Профил — Прогнози U-17' };

export default async function ProfilePage() {
  const user = await requireUser();
  const [profile, stats] = await Promise.all([getProfile(user.id), getProfileStats(user.id)]);

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle>Профил</PageTitle>
        <Link
          href={`/participants/${user.id}`}
          className="text-[13px] font-medium text-brand hover:underline"
        >
          виж как те виждат другите →
        </Link>
      </div>

      <Card>
        <CardHeader title="Данни" subtitle="Тези данни са лични — виждаш ги само ти." />
        <dl className="grid gap-x-6 gap-y-3 px-5 pb-5 pt-4 sm:grid-cols-2">
          <Row label="Име">
            {profile.firstName} {profile.lastName}
          </Row>
          <Row label="Имейл">{profile.email}</Row>
          <Row label="Роля">
            {profile.role === 'admin' ? <Badge kind="partial">админ</Badge> : 'участник'}
          </Row>
          <Row label="Статус">
            {profile.status === 'active' ? <Badge kind="open">активен</Badge> : profile.status}
          </Row>
          <Row label="Регистриран">{formatSofiaDateTime(profile.createdAt)}</Row>
          <Row label="Последно влизане">
            {profile.lastLoginAt ? formatSofiaDateTime(profile.lastLoginAt) : '—'}
          </Row>
        </dl>
      </Card>

      <Card>
        <CardHeader title="Резултати" subtitle="Същите числа вижда и всеки друг участник." />
        <div className="flex flex-wrap gap-2 px-5 pb-5 pt-4">
          <Stat value={stats.points} label="точки" />
          <Stat value={stats.played} label="изиграни мача" />
          <Stat value={stats.predictions} label="прогнози" />
          <Stat value={stats.exactFt} label="точни крайни резултата" />
          <Stat value={stats.exactHt} label="точни полувремена" />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Смяна на паролата"
          subtitle="След смяната другите устройства излизат от профила, а това остава."
        />
        <div className="px-5 pb-5 pt-4">
          <ChangePasswordForm />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</dt>
      <dd className="text-[14px] text-ink">{children}</dd>
    </div>
  );
}
