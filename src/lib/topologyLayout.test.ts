import { describe, expect, it } from "vitest";
import { centeredStartPositions } from "./topologyLayout";

describe("topologyLayout", () => {
  it("centers a single device in the available width", () => {
    expect(centeredStartPositions(1, 74, 132, 1100)).toEqual([513]);
  });

  it("centers two devices symmetrically", () => {
    expect(centeredStartPositions(2, 74, 132, 1100)).toEqual([410, 616]);
  });

  it("keeps four inband access pairs symmetric around the center", () => {
    const positions = centeredStartPositions(4, 116, 139, 1100);
    const centers = positions.map((x) => x + 58);

    expect(positions).toEqual([109.5, 364.5, 619.5, 874.5]);
    expect(centers[0] + centers[3]).toBe(1100);
    expect(centers[1] + centers[2]).toBe(1100);
  });
});
