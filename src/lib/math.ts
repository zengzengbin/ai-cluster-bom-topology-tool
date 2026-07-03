export function ceilDivide(value: number, divisor: number): number {
  if (divisor <= 0) {
    throw new Error("divisor must be greater than 0");
  }
  return Math.ceil(value / divisor);
}

export function roundUpToEven(value: number): number {
  if (value <= 0) {
    return 0;
  }
  const rounded = Math.ceil(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function roundUpPowerOfTwo(value: number): number {
  if (value <= 1) {
    return 1;
  }
  let power = 1;
  while (power < value) {
    power *= 2;
  }
  return power;
}

export function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}
