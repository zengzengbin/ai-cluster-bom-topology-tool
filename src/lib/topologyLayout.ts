export function centeredStartPositions(
  count: number,
  itemWidth: number,
  gap: number,
  containerWidth: number,
  containerLeft = 0
) {
  const safeCount = Math.max(0, Math.trunc(count));

  if (safeCount === 0) {
    return [];
  }

  const totalWidth = safeCount * itemWidth + Math.max(0, safeCount - 1) * gap;
  const start = containerLeft + Math.max(0, (containerWidth - totalWidth) / 2);

  return Array.from({ length: safeCount }, (_, index) => start + index * (itemWidth + gap));
}
