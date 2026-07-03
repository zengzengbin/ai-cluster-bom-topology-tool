import { describe, expect, test } from "vitest";
import { buildOobTopologyViewModel } from "./oobTopologyViewModel";

describe("oob topology view model", () => {
  test("keeps OOB object groups separate and aligned under access switches", () => {
    const model = buildOobTopologyViewModel({
      b300: 129,
      allFlash: 2,
      hybrid: 1,
      management: 8,
      upstreamDeviceCount: 130,
      access: 7,
      totalServers: 140,
      oobPorts: 270
    });

    expect(model.accessSwitches).toHaveLength(5);
    expect(model.accessCount).toBe(7);
    expect(model.accessSwitches.map((sw) => sw.label)).toEqual([
      "OOB Access 1",
      "OOB Access 2",
      "OOB Access 3",
      "OOB Access 4",
      "OOB Access 7"
    ]);
    expect(model.accessSwitches.at(-1)?.label).toBe("OOB Access 7");
    expect(model.objectGroups.map((group) => group.kind)).toEqual([
      "gpu-bmc",
      "flash-bmc",
      "hybrid-bmc",
      "management-bmc",
      "network-security-device-mgmt"
    ]);
    expect(model.hasCollapsedAccess).toBe(true);
    expect(model.ellipsis.x).toBeGreaterThan(model.accessSwitches[3].x);
    expect(model.ellipsis.x).toBeLessThan(model.accessSwitches[4].x);
    expect(model.objectGroups.map((group) => group.accessIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(model.objectGroups[0].x).toBeLessThan(model.objectGroups[1].x);
    expect(model.objectGroups[4].title).toBe("网络/安全设备管理口");
    expect(model.objectGroups[4].count).toBe(130);
    expect(model.objectGroups[4].y).toBeGreaterThan(520);
  });

  test("uses direct links from access switches to each managed object", () => {
    const model = buildOobTopologyViewModel({
      b300: 64,
      allFlash: 2,
      hybrid: 0,
      management: 4,
      upstreamDeviceCount: 16,
      access: 2,
      totalServers: 70,
      oobPorts: 86
    });

    expect(model.accessObjectPaths).toHaveLength(model.objectGroups.length);
    expect(model.objectGroups.map((group) => group.kind)).toEqual([
      "gpu-bmc",
      "flash-bmc",
      "management-bmc",
      "network-security-device-mgmt"
    ]);
    model.accessObjectPaths.forEach((path, index) => {
      expect(path.length).toBe(2);
      expect(path[0][0]).toBe(model.objectGroups[index].x + model.objectGroups[index].width / 2);
      expect(path[0][1]).toBe(model.objectGroups[index].y);
      expect(path[1][1]).toBe(model.accessSwitches[model.objectGroups[index].accessIndex].y + model.accessSwitches[model.objectGroups[index].accessIndex].size);
    });
  });

  test("centers one or two visible OOB access switches instead of pinning them to the edges", () => {
    const single = buildOobTopologyViewModel({
      b300: 4,
      allFlash: 0,
      hybrid: 0,
      management: 0,
      upstreamDeviceCount: 2,
      access: 1,
      totalServers: 4,
      oobPorts: 6
    });
    const dual = buildOobTopologyViewModel({
      b300: 28,
      allFlash: 0,
      hybrid: 0,
      management: 0,
      upstreamDeviceCount: 2,
      access: 2,
      totalServers: 28,
      oobPorts: 30
    });

    expect(single.accessSwitches.map((sw) => sw.x)).toEqual([536]);
    expect(dual.accessSwitches.map((sw) => sw.x)).toEqual([400, 672]);
    expect(dual.accessSwitches[0].x + dual.accessSwitches[1].x + dual.accessSwitches[0].size).toBe(1120);
  });

  test("draws stack links plus paired vertical uplinks and downlinks for aggregation switches", () => {
    const model = buildOobTopologyViewModel({
      b300: 128,
      allFlash: 8,
      hybrid: 16,
      management: 8,
      upstreamDeviceCount: 130,
      access: 7,
      totalServers: 160,
      oobPorts: 290
    });

    expect(model.aggregationStackPaths).toHaveLength(2);
    expect(model.aggregationCorePaths).toHaveLength(4);
    model.aggregationCorePaths.forEach((path) => {
      expect(path[0][0]).toBe(path[1][0]);
    });
    expect(model.accessAggPaths).toHaveLength(14);
    expect(model.accessAggPaths.slice(0, 4).every((path) => path[0][0] === path[1][0])).toBe(true);
    expect(model.accessAggPaths.slice(0, 4).every((path) => path[1][1] === 226)).toBe(true);

    model.accessSwitches.forEach((sw) => {
      const startsAtSwitch = model.accessAggPaths.filter((path) => {
        const [start] = path;
        return start[0] >= sw.x && start[0] <= sw.x + sw.size && start[1] === sw.y;
      });
      expect(startsAtSwitch).toHaveLength(2);
    });

    const switchUplinks = model.accessAggPaths.filter((path) =>
      model.accessSwitches.some((sw) => path[0][1] === sw.y && path[0][0] >= sw.x && path[0][0] <= sw.x + sw.size)
    );
    expect(switchUplinks).toHaveLength(model.accessSwitches.length * 2);
    expect(switchUplinks.filter((path) => path[1][0] < 560)).toHaveLength(model.accessSwitches.length);
    expect(switchUplinks.filter((path) => path[1][0] > 560)).toHaveLength(model.accessSwitches.length);
    expect(model.accessAggPaths.some((path) => path.length === 2 && path[0][1] === path[1][1] && Math.abs(path[0][0] - path[1][0]) > 120)).toBe(false);
  });

  test("uses one downlink per aggregation when only one access switch remains", () => {
    const model = buildOobTopologyViewModel({
      b300: 4,
      allFlash: 0,
      hybrid: 0,
      management: 0,
      upstreamDeviceCount: 2,
      access: 1,
      totalServers: 4,
      oobPorts: 6
    });

    const verticalDownlinks = model.accessAggPaths.filter((path) => path[0][0] === path[1][0]);
    expect(verticalDownlinks).toHaveLength(2);
    expect(model.accessAggPaths).toHaveLength(4);
  });

  test("does not leave visible access switches without a downlink", () => {
    const model = buildOobTopologyViewModel({
      b300: 128,
      allFlash: 8,
      hybrid: 16,
      management: 8,
      upstreamDeviceCount: 130,
      access: 7,
      totalServers: 160,
      oobPorts: 290
    });

    model.accessSwitches.forEach((sw) => {
      const accessCenterX = sw.x + sw.size / 2;
      const hasDownlink = model.accessObjectPaths.some((path) => {
        const end = path[path.length - 1];
        return end[0] === accessCenterX && end[1] === sw.y + sw.size;
      });
      expect(hasDownlink).toBe(true);
    });
  });
});
