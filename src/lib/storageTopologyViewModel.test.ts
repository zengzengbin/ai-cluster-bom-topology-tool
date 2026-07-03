import { describe, expect, it } from "vitest";
import {
  storageLeafSpineTargetIndexes,
  storageServerLeafTargetIndexes,
  storagePortIndexes,
  visibleStorageServerLabels
} from "./storageTopologyViewModel";

describe("storage topology view model", () => {
  it("renders storage server ports from storage NIC count instead of 8 compute NICs", () => {
    expect(storagePortIndexes(1)).toEqual([1]);
    expect(storagePortIndexes(2)).toEqual([1, 2]);
    expect(storagePortIndexes(4)).toEqual([1, 2, 3, 4]);
  });

  it("uses first, second, and last representative servers when a group has many servers", () => {
    expect(visibleStorageServerLabels("GPU", 128)).toEqual(["GPU1", "GPU2", "GPU128"]);
    expect(visibleStorageServerLabels("Flash", 1)).toEqual(["Flash1"]);
    expect(visibleStorageServerLabels("Flash", 2)).toEqual(["Flash1", "Flash2"]);
  });

  it("distributes representative server uplinks across different leaf switches", () => {
    expect(storageServerLeafTargetIndexes(0, 2, 10)).toEqual([0, 1]);
    expect(storageServerLeafTargetIndexes(1, 2, 10)).toEqual([2, 3]);
    expect(storageServerLeafTargetIndexes(2, 2, 10)).toEqual([4, 5]);
    expect(storageServerLeafTargetIndexes(0, 1, 10)).toEqual([0]);
  });

  it("draws each representative leaf uplink to every visible spine representative", () => {
    expect(storageLeafSpineTargetIndexes(0, 4)).toEqual([0, 1, 2, 3]);
    expect(storageLeafSpineTargetIndexes(1, 4)).toEqual([0, 1, 2, 3]);
    expect(storageLeafSpineTargetIndexes(2, 4)).toEqual([0, 1, 2, 3]);
    expect(storageLeafSpineTargetIndexes(0, 3)).toEqual([0, 1, 2]);
  });
});
