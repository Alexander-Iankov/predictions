/**
 * Емблемата на отбор, свалена от bgclubs.eu и сервирана от нашия public/logos.
 *
 * Отдолу винаги стои монограм с първата буква. Ако картинката липсва (нов отбор,
 * за който още не е пуснат `npm run fetch:crests`), `alt=""` кара браузъра да не
 * рисува нищо и монограмът остава видим — резервен вариант без нито ред
 * JavaScript.
 *
 * Нарочно без `loading="lazy"`: емблемите са 16 уникални файла по няколко
 * килобайта, които браузърът кешира и преизползва на всеки ред. Отлагането не
 * пести нищо, а прави показването зависимо от observer, който за съдържание в
 * свит `<details>` не се задейства.
 */
export function TeamCrest({
  crestId,
  name,
  size = 28,
}: {
  crestId: number | null;
  name: string;
  size?: number;
}) {
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <span
      className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-sunken ring-1 ring-line"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="absolute font-bold text-faint"
        style={{ fontSize: Math.round(size * 0.42) }}
      >
        {initial}
      </span>

      {crestId === null ? null : (
        <img
          src={`/logos/${crestId}.png`}
          alt=""
          width={size}
          height={size}
          decoding="async"
          className="relative h-full w-full object-contain"
        />
      )}
    </span>
  );
}
