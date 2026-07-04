export const B300_MIN = 1;
export const B300_MAX = 224;
export const AUXILIARY_SERVER_MIN = 0;
export const AUXILIARY_SERVER_MAX = 64;

export function normalizeB300Servers(value: number) {
  if (!Number.isFinite(value)) {
    return B300_MIN;
  }

  return Math.min(B300_MAX, Math.max(B300_MIN, Math.trunc(value)));
}

export function normalizeAuxiliaryServers(value: number) {
  if (!Number.isFinite(value)) {
    return AUXILIARY_SERVER_MIN;
  }

  return Math.min(AUXILIARY_SERVER_MAX, Math.max(AUXILIARY_SERVER_MIN, Math.trunc(value)));
}