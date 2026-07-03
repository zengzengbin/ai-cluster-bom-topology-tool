import { describe, expect, test } from "vitest";
import type { OverviewTopologyMetrics } from "../types";
import { buildOverviewTopologyViewModel } from "./overviewTopologyViewModel";

function makeMetrics(overrides: Partial<OverviewTopologyMetrics> = {}): OverviewTopologyMetrics {
  return {
    b300: 128,
    allFlash: 8,
    hybrid: 16,
    management: 8,
    gpuStoragePortsPerServer: 2,
    allFlashStoragePortsPerServer: 2,
    computeSupported: true,
    storageEnabled: true,
    computeLeaf: 64,
    computeSpine: 32,
    storageLeaf: 10,
    storageSpine: 8,
    inbandLeaf: 8,
    inbandCore: 2,
    inbandBorder: 2,
    exitSwitches: 2,
    firewalls: 2,
    oobAccess: 7,
    oobAggregation: 2,
    oobManagedDeviceCount: 118,
    computeFromB300: true,
    storageFromB300: true,
    storageFromAllFlash: true,
    inbandFromB300: true,
    inbandFromAllFlash: true,
    inbandFromHybrid: true,
    inbandFromManagement: true,
    oobFromB300: true,
    oobFromAllFlash: true,
    oobFromHybrid: true,
    oobFromManagement: true,
    ...overrides
  };
}

describe("buildOverviewTopologyViewModel", () => {
  test("keeps the four networks aligned to the participating server groups", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());

    expect(model.computeSources).toEqual(["b300"]);
    expect(model.storageSources).toEqual(["b300", "allFlash"]);
    expect(model.inbandSources).toEqual(["b300", "allFlash", "hybrid", "management"]);
    expect(model.oobSources).toEqual(["b300", "allFlash", "hybrid", "management"]);
  });

  test("includes network and security management ports in out-of-band managed objects", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());

    expect(model.oobManagedObject?.items).toEqual(["服务器 BMC", "网络/安全设备管理口"]);
  });

  test("builds B300 NIC groups as 8 compute, 2 storage, 2 inband, 1 out-of-band", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());
    const b300 = model.serverGroups.find((group) => group.key === "b300");

    expect(b300?.nicGroups.map((group) => [group.key, group.count])).toEqual([
      ["compute", 8],
      ["storage", 2],
      ["oob", 1],
      ["inband", 2]
    ]);
  });

  test("renders overview in-band management with core and access inside the in-band area", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());
    const zones = Object.fromEntries(model.zones.map((zone) => [zone.key, zone]));
    const coreDevices = model.securityDevices.filter((device) => device.key.startsWith("core"));
    const borderCoreLinks = model.internalLinks.filter((link) => link.key.startsWith("border-core-"));

    expect(model.inbandDevices.map((device) => device.key)).toEqual(["inband-access-1", "inband-access-2"]);
    expect(new Set(model.inbandDevices.map((device) => device.y)).size).toBe(1);
    expect(coreDevices.every((device) => device.x > zones.inband.x && device.x < zones.inband.x + zones.inband.w)).toBe(true);
    expect(coreDevices.every((device) => device.y > zones.inband.y && device.y < zones.inband.y + zones.inband.h)).toBe(true);
    expect(borderCoreLinks).toHaveLength(4);
    expect(new Set(borderCoreLinks.map((link) => link.key))).toEqual(
      new Set(["border-core-border1-core1", "border-core-border1-core2", "border-core-border2-core1", "border-core-border2-core2"])
    );
    expect(borderCoreLinks.every((link) => link.path[0][1] > link.path.at(-1)![1])).toBe(true);
    expect(borderCoreLinks.every((link) => link.path.at(-1)![1] === coreDevices.find((device) => device.key === link.key.split("-").at(-1))?.y)).toBe(true);
    expect(new Set(borderCoreLinks.filter((link) => link.key.includes("border1")).map((link) => link.path[0][0])).size).toBe(2);
    expect(new Set(borderCoreLinks.filter((link) => link.key.includes("core1")).map((link) => link.path.at(-1)![0])).size).toBe(2);
    expect(model.internalLinks.some((link) => link.key.startsWith("inband-leaf-"))).toBe(false);
  });

  test("routes server in-band source links upward instead of through server cards", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());
    const inbandLinks = model.sourceLinks.filter((link) => link.target === "inband");
    const servers = new Map(model.serverGroups.map((group) => [group.key, group]));

    expect(inbandLinks).toHaveLength(4);
    inbandLinks.forEach((link) => {
      const server = servers.get(link.source);
      expect(link.path[1][1]).toBeLessThan(link.path[0][1]);
      expect(link.path[1][1]).toBeLessThan(server?.y ?? 0);
      expect(link.path[2][1]).toBe(link.path[1][1]);
    });
  });

  test("keeps the overview compact and removes UAC wording from border nodes", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());

    expect(model.canvasW).toBeLessThan(1520);
    expect(model.securityDevices.filter((device) => device.key.startsWith("border")).map((device) => device.label)).toEqual(["BRD1", "BRD2"]);
    expect(model.serverZoneNote).toBe("");
  });

  test("places compute and storage fabrics below servers and routes from bottom NICs to leaf nodes", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());
    const zones = Object.fromEntries(model.zones.map((zone) => [zone.key, zone]));
    const b300 = model.serverGroups.find((group) => group.key === "b300");
    const computeLink = model.sourceLinks.find((link) => link.key === "b300-compute");
    const storageLink = model.sourceLinks.find((link) => link.key === "b300-storage");

    expect(zones.compute.y).toBeGreaterThan(zones.servers.y);
    expect(zones.storage.y).toBeGreaterThan(zones.servers.y);
    expect(zones.servers.y).toBeLessThan(500);
    expect(b300?.sourceAnchors.compute?.y).toBeGreaterThan((b300?.chassis.y ?? 0) + (b300?.chassis.h ?? 0));
    expect(b300?.sourceAnchors.storage?.y).toBeGreaterThan((b300?.chassis.y ?? 0) + (b300?.chassis.h ?? 0));
    expect(b300?.sourceAnchors.oob?.y).toBeGreaterThan((b300?.chassis.y ?? 0) + (b300?.chassis.h ?? 0));
    expect(computeLink?.path.at(-1)?.[1]).toBeGreaterThan(computeLink?.path[0][1] ?? 0);
    expect(storageLink?.path.at(-1)?.[1]).toBeGreaterThan(storageLink?.path[0][1] ?? 0);
  });

  test("moves security left, lowers out-of-band management, and removes OOB access crosslink", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());
    const zones = Object.fromEntries(model.zones.map((zone) => [zone.key, zone]));

    expect(zones.security.x).toBeLessThan(zones.inband.x);
    expect(zones.oob.y).toBeGreaterThan(zones.servers.y);
    expect(model.oobDevices.every((device) => device.y > zones.oob.y && device.y < zones.oob.y + zones.oob.h)).toBe(true);
    expect(model.oobDevices.filter((device) => device.key.includes("-access-")).map((device) => device.label)).toEqual(["OOB接入", "OOB接入"]);
    expect(model.oobDevices.filter((device) => device.key.includes("-access-")).every((device) => device.y < model.oobDevices.find((item) => item.key === "oob-agg-1")!.y)).toBe(true);
    expect(model.internalLinks.some((link) => link.key.includes("oob-access-1-oob-access-2"))).toBe(false);
  });

  test("keeps security and in-band management in the upper half without external ISP links", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());
    const zones = Object.fromEntries(model.zones.map((zone) => [zone.key, zone]));

    expect(zones.security.y).toBeLessThan(140);
    expect(zones.inband.y).toBeLessThan(320);
    expect(zones.security.y + zones.security.h).toBeLessThan(zones.servers.y);
    expect(zones.inband.y + zones.inband.h).toBeLessThanOrEqual(zones.servers.y);
    expect(model.internalLinks.some((link) => link.key.startsWith("isp-"))).toBe(false);
  });

  test("draws two firewall HA links in the security area", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());

    expect(model.internalLinks.filter((link) => link.key.startsWith("fw1-fw2-"))).toHaveLength(2);
  });

  test("hides storage fabric devices and storage NICs when storage is disabled", () => {
    const model = buildOverviewTopologyViewModel(
      makeMetrics({
        storageEnabled: false,
        storageLeaf: 0,
        storageSpine: 0,
        storageFromB300: false,
        storageFromAllFlash: false,
        gpuStoragePortsPerServer: 0,
        allFlashStoragePortsPerServer: 0
      })
    );

    expect(model.storageDevices).toHaveLength(0);
    expect(model.storageSources).toEqual([]);
    expect(model.storageState?.title).toBe("未配置 400G 存储网卡");
    expect(model.serverGroups.find((group) => group.key === "b300")?.nicGroups.some((group) => group.key === "storage")).toBe(false);
    expect(model.serverGroups.find((group) => group.key === "allFlash")?.nicGroups.some((group) => group.key === "storage")).toBe(false);
  });

  test("keeps B300 compute NICs but suppresses compute fabric when compute is unsupported", () => {
    const model = buildOverviewTopologyViewModel(
      makeMetrics({
        computeSupported: false,
        computeLeaf: 0,
        computeSpine: 0
      })
    );

    expect(model.computeDevices).toHaveLength(0);
    expect(model.computeSources).toEqual([]);
    expect(model.computeState?.title).toBe("二层计算网本阶段不生成");
    expect(model.serverGroups.find((group) => group.key === "b300")?.nicGroups.some((group) => group.key === "compute")).toBe(true);
  });

  test("does not draw representative leaf nodes when the computed leaf count is zero", () => {
    const computeModel = buildOverviewTopologyViewModel(
      makeMetrics({
        computeLeaf: 0,
        computeSpine: 2
      })
    );
    const storageModel = buildOverviewTopologyViewModel(
      makeMetrics({
        storageLeaf: 0,
        storageSpine: 2
      })
    );

    expect(computeModel.computeDevices.some((device) => device.key.includes("-leaf-"))).toBe(false);
    expect(computeModel.computeDevices.some((device) => device.key.includes("-spine-"))).toBe(true);
    expect(storageModel.storageDevices.some((device) => device.key.includes("-leaf-"))).toBe(false);
    expect(storageModel.storageDevices.some((device) => device.key.includes("-spine-"))).toBe(true);
  });

  test("routes B300 compute source to spine when compute leaf count is zero", () => {
    const model = buildOverviewTopologyViewModel(
      makeMetrics({
        b300: 2,
        computeLeaf: 0,
        computeSpine: 2
      })
    );
    const computeSpines = model.computeDevices.filter((device) => device.key.includes("-spine-"));
    const computeLink = model.sourceLinks.find((link) => link.key === "b300-compute");

    expect(computeSpines).toHaveLength(2);
    expect(computeSpines.every((device) => device.y < 900)).toBe(true);
    expect(computeLink).toBeDefined();
    expect(computeLink?.path.at(-1)).toEqual([computeSpines[0].x + (computeSpines[0].size ?? 48) / 2, computeSpines[0].y]);
  });

  test("hides server groups whose quantity is zero", () => {
    const model = buildOverviewTopologyViewModel(
      makeMetrics({
        allFlash: 0,
        hybrid: 0,
        management: 0,
        storageFromAllFlash: false,
        inbandFromAllFlash: false,
        inbandFromHybrid: false,
        inbandFromManagement: false,
        oobFromAllFlash: false,
        oobFromHybrid: false,
        oobFromManagement: false
      })
    );

    expect(model.serverGroups.map((group) => group.key)).toEqual(["b300"]);
    expect(model.storageSources).toEqual(["b300"]);
    expect(model.inbandSources).toEqual(["b300"]);
    expect(model.oobSources).toEqual(["b300"]);
    expect(model.showServerSourceCallout).toBe(false);
  });

  test("hides server source callout whenever all-flash servers are zero", () => {
    const model = buildOverviewTopologyViewModel(
      makeMetrics({
        allFlash: 0,
        storageFromAllFlash: false,
        inbandFromAllFlash: false,
        oobFromAllFlash: false
      })
    );

    expect(model.serverGroups.map((group) => group.key)).not.toContain("allFlash");
    expect(model.serverGroups.map((group) => group.key)).toContain("hybrid");
    expect(model.showServerSourceCallout).toBe(false);
  });

  test.each([
    {
      name: "all-flash only",
      metrics: {
        allFlash: 0,
        storageFromAllFlash: false,
        inbandFromAllFlash: false,
        oobFromAllFlash: false
      },
      servers: ["b300", "hybrid", "management"],
      storageSources: ["b300"],
      managementSources: ["b300", "hybrid", "management"]
    },
    {
      name: "hybrid only",
      metrics: {
        hybrid: 0,
        inbandFromHybrid: false,
        oobFromHybrid: false
      },
      servers: ["b300", "allFlash", "management"],
      storageSources: ["b300", "allFlash"],
      managementSources: ["b300", "allFlash", "management"]
    },
    {
      name: "management only",
      metrics: {
        management: 0,
        inbandFromManagement: false,
        oobFromManagement: false
      },
      servers: ["b300", "allFlash", "hybrid"],
      storageSources: ["b300", "allFlash"],
      managementSources: ["b300", "allFlash", "hybrid"]
    },
    {
      name: "all-flash and hybrid",
      metrics: {
        allFlash: 0,
        hybrid: 0,
        storageFromAllFlash: false,
        inbandFromAllFlash: false,
        inbandFromHybrid: false,
        oobFromAllFlash: false,
        oobFromHybrid: false
      },
      servers: ["b300", "management"],
      storageSources: ["b300"],
      managementSources: ["b300", "management"]
    },
    {
      name: "all-flash and management",
      metrics: {
        allFlash: 0,
        management: 0,
        storageFromAllFlash: false,
        inbandFromAllFlash: false,
        inbandFromManagement: false,
        oobFromAllFlash: false,
        oobFromManagement: false
      },
      servers: ["b300", "hybrid"],
      storageSources: ["b300"],
      managementSources: ["b300", "hybrid"]
    },
    {
      name: "hybrid and management",
      metrics: {
        hybrid: 0,
        management: 0,
        inbandFromHybrid: false,
        inbandFromManagement: false,
        oobFromHybrid: false,
        oobFromManagement: false
      },
      servers: ["b300", "allFlash"],
      storageSources: ["b300", "allFlash"],
      managementSources: ["b300", "allFlash"]
    }
  ])("hides zero-count server groups and links for $name", ({ metrics, servers, storageSources, managementSources }) => {
    const model = buildOverviewTopologyViewModel(makeMetrics(metrics));

    expect(model.serverGroups.map((group) => group.key)).toEqual(servers);
    expect(model.storageSources).toEqual(storageSources);
    expect(model.inbandSources).toEqual(managementSources);
    expect(model.oobSources).toEqual(managementSources);
    expect(model.sourceLinks.every((link) => servers.includes(link.source))).toBe(true);
  });

  test("starts source links from NIC anchors and keeps out-of-band source links dashed", () => {
    const model = buildOverviewTopologyViewModel(makeMetrics());
    const b300 = model.serverGroups.find((group) => group.key === "b300");
    const computeLink = model.sourceLinks.find((link) => link.key === "b300-compute");
    const oobLink = model.sourceLinks.find((link) => link.key === "b300-oob");

    expect(computeLink?.path[0]).toEqual([b300?.sourceAnchors.compute?.x, b300?.sourceAnchors.compute?.y]);
    expect(oobLink?.path[0]).toEqual([b300?.sourceAnchors.oob?.x, b300?.sourceAnchors.oob?.y]);
    expect(oobLink?.dashed).toBe(true);
  });
});
