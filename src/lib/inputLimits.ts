export const B300_MIN = 1;
export const B300_MAX = 224;

export function normalizeB300Servers(value: number) {
  if (!Number.isFinite(value)) {
    return B300_MIN;
  }

  return Math.min(B300_MAX, Math.max(B300_MIN, Math.trunc(value)));
}
