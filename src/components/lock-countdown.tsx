'use client';

import { useEffect, useState } from 'react';
import { URGENT_MS, formatRemaining } from '@/lib/time';

/**
 * Живо отброяване до затварянето на прозореца за прогнози.
 *
 * Тиктака всяка секунда само в последния час, когато секундите значат нещо;
 * дотогава веднъж в минута, за да не въртим стотици таймера на страницата с
 * всички кръгове.
 *
 * Сървърът рендира стойност по своето време, а браузърът я преизчислява при
 * hydration — затова suppressHydrationWarning: разликата от секунда-две е
 * очаквана, не е грешка.
 */
export function LockCountdown({ lockAt }: { lockAt: string }) {
  const target = new Date(lockAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const current = Date.now();
      setNow(current);

      const remaining = target - current;
      const delay = remaining > 0 && remaining < URGENT_MS ? 1_000 : 60_000;
      timer = setTimeout(tick, delay);
    };

    tick();
    return () => clearTimeout(timer);
  }, [target]);

  const remaining = target - now;

  if (remaining <= 0) {
    return (
      <span className="whitespace-nowrap text-xs text-muted" suppressHydrationWarning>
        прозорецът се затвори — презареди
      </span>
    );
  }

  const urgent = remaining < URGENT_MS;

  return (
    <span
      className={`whitespace-nowrap text-xs tabular-nums ${urgent ? 'font-semibold text-warn' : 'text-muted'}`}
      suppressHydrationWarning
      title="време до затваряне на прогнозите (1 час преди началото)"
    >
      остават {formatRemaining(remaining)}
    </span>
  );
}
