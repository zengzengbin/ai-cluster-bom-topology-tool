import { describe, expect, it } from "vitest";
import { normalizeB300Servers } from "./inputLimits";

describe("input limits", () => {
  it("keeps B300 server input between 1 and 224", () => {
    expect(normalizeB300Servers(0)).toBe(1);
    expect(normalizeB300Servers(1)).toBe(1);
    expect(normalizeB300Servers(128)).toBe(128);
    expect(normalizeB300Servers(224)).toBe(224);
    expect(normalizeB300Servers(225)).toBe(224);
    expect(normalizeB300Servers(Number.NaN)).toBe(1);
  });
});
