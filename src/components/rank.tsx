/**
 * Място в класация.
 *
 * Първите три получават малко тежест, останалите остават дискретни — иначе
 * дълъг списък се превръща в шарена стена.
 */
export function Rank({ place }: { place: number }) {
  const medal =
    place === 1
      ? 'bg-[#f4e2b4] text-[#7a5b12]'
      : place === 2
        ? 'bg-[#e3e6ea] text-[#565f6b]'
        : place === 3
          ? 'bg-[#f0d9c6] text-[#7c4f2c]'
          : '';

  if (!medal) {
    return <span className="inline-block w-6 text-center tabular-nums text-muted">{place}</span>;
  }

  return (
    <span
      className={`inline-grid size-6 place-items-center rounded-full text-[12px] font-bold tabular-nums ${medal}`}
    >
      {place}
    </span>
  );
}

/**
 * Място при равни точки: еднаквите резултати делят мястото.
 *
 * Без това двама с еднакви точки биха изглеждали като първи и втори, което е
 * невярно и се забелязва веднага от участниците.
 */
export function placesByPoints(points: Array<number | null>): number[] {
  const places: number[] = [];
  let lastPoints: number | null | undefined;
  let lastPlace = 0;

  points.forEach((value, index) => {
    if (value !== lastPoints) {
      lastPlace = index + 1;
      lastPoints = value;
    }
    places.push(lastPlace);
  });

  return places;
}
