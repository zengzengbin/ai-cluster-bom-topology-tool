import { describe, expect, it } from "vitest";
import { calculateAll } from "./calculate";
import type { InputState } from "../types";

const base: InputState = {
  b300Servers: 128,
  allFlashServers: 8,
  hybridStorageServers: 16,
  managementServers: 8,
  gpuStoragePortsPerServer: 2,
  allFlashStoragePortsPerServer: 2
};

describe("network calculations", () => {
  it("calculates virtual dual-plane compute network for 128 B300 servers", () => {
    const result = calculateAll(base);
    const compute = result.networks.find((network) => network.key === "compute")!;

    expect(compute.summary["组网"]).toBe("虚拟双平面");
    expect(compute.summary["LEAF"]).toBe(64);
    expect(compute.summary["SPINE"]).toBe(32);
  });

  it("calculates physical dual-plane compute network for 138 B300 servers", () => {
    const result = calculateAll({ ...base, b300Servers: 138 });
    const compute = result.networks.find((network) => network.key === "compute")!;

    expect(compute.summary["组网"]).toBe("物理双平面");
    expect(compute.summary["POD"]).toBe(5);
    expect(compute.summary["LEAF"]).toBe(80);
    expect(compute.summary["SPINE"]).toBe(64);
  });

  it("uses direct dual-spine compute network for no more than 4 B300 servers", () => {
    const result = calculateAll({ ...base, b300Servers: 4 });
    const compute = result.networks.find((network) => network.key === "compute")!;

    expect(compute.summary["组网"]).toBe("双 Spine 直连");
    expect(compute.summary["POD"]).toBe(1);
    expect(compute.summary["LEAF"]).toBe(0);
    expect(compute.summary["SPINE"]).toBe(2);
    expect(compute.items.map((entry) => entry.productName)).not.toContain("计算网 LEAF 交换机");
    expect(compute.items.map((entry) => entry.productName)).not.toContain("SPINE-LEAF 互联 LPO 光模块");
    expect(compute.items[0].formula).toBe("实际一台就够，考虑避免单点故障为 2 台。");
    expect(compute.items.find((entry) => entry.productName === "SPINE下联光模块")?.quantity).toBe(4 * 16);
    expect(compute.items.find((entry) => entry.productName === "SPINE互联光模块")?.quantity).toBe(4 * 8 * 2);
    expect(compute.items.find((entry) => entry.productName === "SPINE互联光模块")?.model).toBe("400G-Q112-DR4-L");
    expect(compute.items.find((entry) => entry.productName === "SPINE互联光模块")?.formula).toBe("CX8 网卡数 * 2。");
    expect(compute.items.find((entry) => entry.productName === "SPINE间互联光纤-50米")?.quantity).toBe((4 * 8 * 2) / 2);
  });

  it("keeps virtual dual-plane compute network for 5 B300 servers", () => {
    const result = calculateAll({ ...base, b300Servers: 5 });
    const compute = result.networks.find((network) => network.key === "compute")!;

    expect(compute.summary["组网"]).toBe("虚拟双平面");
    expect(compute.summary["POD"]).toBe(1);
    expect(compute.summary["LEAF"]).toBe(4);
    expect(compute.summary["SPINE"]).toBe(2);
    expect(compute.items.map((entry) => entry.productName)).toContain("计算网 LEAF 交换机");
    expect(compute.items.map((entry) => entry.productName)).toContain("SPINE-LEAF 互联 LPO 光模块");
  });

  it("rounds the last virtual pod leaf count to a power of two without exceeding 16", () => {
    const cases = [
      { b300Servers: 33, pods: 2, leaf: 18, spine: 16 },
      { b300Servers: 51, pods: 2, leaf: 32, spine: 16 },
      { b300Servers: 65, pods: 3, leaf: 34, spine: 32 },
      { b300Servers: 81, pods: 3, leaf: 48, spine: 32 },
      { b300Servers: 97, pods: 4, leaf: 50, spine: 32 }
    ];

    for (const testCase of cases) {
      const result = calculateAll({ ...base, b300Servers: testCase.b300Servers });
      const compute = result.networks.find((network) => network.key === "compute")!;

      expect(compute.summary["组网"]).toBe("虚拟双平面");
      expect(compute.summary["POD"]).toBe(testCase.pods);
      expect(compute.summary["LEAF"]).toBe(testCase.leaf);
      expect(compute.summary["SPINE"]).toBe(testCase.spine);
      expect(compute.items.find((entry) => entry.productName === "计算网 LEAF 交换机")?.formula).toContain("单 POD≤16");
    }
  });

  it("keeps virtual dual-plane compute network for 28 B300 servers", () => {
    const result = calculateAll({ ...base, b300Servers: 28 });
    const compute = result.networks.find((network) => network.key === "compute")!;

    expect(compute.summary["组网"]).toBe("虚拟双平面");
    expect(compute.summary["POD"]).toBe(1);
    expect(compute.summary["LEAF"]).toBe(16);
    expect(compute.summary["SPINE"]).toBe(8);
    expect(compute.items.map((entry) => entry.productName)).toContain("计算网 LEAF 交换机");
    expect(compute.items.map((entry) => entry.productName)).toContain("SPINE-LEAF 互联 LPO 光模块");
  });

  it("keeps virtual dual-plane compute network for 32 B300 servers", () => {
    const result = calculateAll({ ...base, b300Servers: 32 });
    const compute = result.networks.find((network) => network.key === "compute")!;

    expect(compute.summary["组网"]).toBe("虚拟双平面");
    expect(compute.summary["POD"]).toBe(1);
    expect(compute.summary["LEAF"]).toBe(16);
    expect(compute.summary["SPINE"]).toBe(8);
    expect(compute.items.map((entry) => entry.productName)).toContain("计算网 LEAF 交换机");
    expect(compute.items.map((entry) => entry.productName)).toContain("SPINE-LEAF 互联 LPO 光模块");
  });

  it("keeps virtual dual-plane compute network for 64 B300 servers", () => {
    const result = calculateAll({ ...base, b300Servers: 64 });
    const compute = result.networks.find((network) => network.key === "compute")!;

    expect(compute.summary["组网"]).toBe("虚拟双平面");
    expect(compute.summary["POD"]).toBe(2);
    expect(compute.summary["LEAF"]).toBe(32);
    expect(compute.summary["SPINE"]).toBe(16);
  });

  it("uses physical dual-plane compute network and escape links from 129 B300 servers", () => {
    const result = calculateAll({ ...base, b300Servers: 129 });
    const compute = result.networks.find((network) => network.key === "compute")!;

    expect(compute.summary["组网"]).toBe("物理双平面");
    expect(compute.summary["POD"]).toBe(5);
    expect(compute.summary["LEAF"]).toBe(80);
    expect(compute.summary["SPINE"]).toBe(64);
    expect(compute.items.find((entry) => entry.productName === "SPINE逃生链路 LPO光模块")?.quantity).toBe(64 * 8);
    expect(compute.items.find((entry) => entry.productName === "SPINE逃生链路互联光纤-10米")?.quantity).toBe((64 * 8) / 2);
  });

  it("calculates storage network for 128 GPU, 8 all-flash, and two 400G ports", () => {
    const result = calculateAll(base);
    const storage = result.networks.find((network) => network.key === "storage")!;

    expect(storage.summary["400G接入口"]).toBe(272);
    expect(storage.summary["LEAF"]).toBe(10);
    expect(storage.summary["SPINE"]).toBe(8);
  });

  it("supports zero and four-port storage NIC options", () => {
    const result = calculateAll({
      ...base,
      b300Servers: 4,
      allFlashServers: 2,
      gpuStoragePortsPerServer: 0,
      allFlashStoragePortsPerServer: 4
    });
    const storage = result.networks.find((network) => network.key === "storage")!;

    expect(storage.summary["400G接入口"]).toBe(8);
    expect(storage.summary["LEAF"]).toBe(2);
    expect(storage.summary["SPINE"]).toBe(0);
    expect(storage.items.map((entry) => entry.productName)).not.toContain("存储网 Spine 交换机");
    expect(storage.items.map((entry) => entry.productName)).not.toContain("SPINE-LEAF 互联光模块");
    expect(storage.items.map((entry) => entry.productName)).not.toContain("SPINE-LEAF 互联光纤");
    expect(storage.items.find((entry) => entry.productName === "LEAF互联光模块")?.quantity).toBe(8);
    expect(storage.items.find((entry) => entry.productName === "LEAF互联光纤")?.quantity).toBe(4);
    expect(storage.items.find((entry) => entry.productName === "LEAF 下联模块")?.quantity).toBe(8);
    expect(storage.items.map((entry) => entry.sequence)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("does not create storage spine switches when no 400G storage ports are configured", () => {
    const result = calculateAll({
      ...base,
      gpuStoragePortsPerServer: 0,
      allFlashStoragePortsPerServer: 0
    });
    const storage = result.networks.find((network) => network.key === "storage")!;

    expect(storage.summary["400G接入口"]).toBe(0);
    expect(storage.summary["LEAF"]).toBe(0);
    expect(storage.summary["SPINE"]).toBe(0);
  });

  it("calculates inband network for 160 servers", () => {
    const result = calculateAll(base);
    const inband = result.networks.find((network) => network.key === "inband")!;

    expect(inband.summary["25G接口"]).toBe(320);
    expect(inband.summary["LEAF"]).toBe(8);
    expect(inband.items[0].sequence).toBe("1");
    expect(inband.items[inband.items.length - 1].sequence).toBe("12");
  });

  it("starts oob sequence from 1 and keeps only device rows in upstream count", () => {
    const result = calculateAll({
      ...base,
      b300Servers: 4,
      allFlashServers: 2,
      hybridStorageServers: 0,
      managementServers: 0,
      gpuStoragePortsPerServer: 0,
      allFlashStoragePortsPerServer: 4
    });
    const oob = result.networks.find((network) => network.key === "oob")!;

    expect(oob.items.map((entry) => entry.sequence)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(oob.items[0].description).toContain("含100G AOC线缆*2");
    expect(oob.summary["网络安全设备"]).toBe(14);
  });

  it("blocks unsupported two-tier compute results beyond 224 B300 servers", () => {
    const result = calculateAll({ ...base, b300Servers: 225 });
    const compute = result.networks.find((network) => network.key === "compute")!;

    expect(result.isComputeSupported).toBe(false);
    expect(compute.summary["组网"]).toBe("超出二层范围");
    expect(compute.items[0].quantity).toBe("暂不生成");
    expect(result.warnings.some((warning) => warning.includes("超过 224"))).toBe(true);
  });

  it("emits a single storage info row when no 400G storage ports are configured", () => {
    const result = calculateAll({
      ...base,
      gpuStoragePortsPerServer: 0,
      allFlashStoragePortsPerServer: 0
    });
    const storage = result.networks.find((network) => network.key === "storage")!;

    expect(storage.items).toHaveLength(1);
    expect(storage.items[0].productName).toBe("存储网未配置提示");
    expect(storage.items[0].quantity).toBe("暂不生成");
    expect(storage.items[0].sequence).toBe("-");
  });

  it("builds overview metrics for the unified topology from server-source participation", () => {
    const result = calculateAll(base);
    const metrics = result.overviewTopology.metrics as Record<string, number | boolean | string>;

    expect(result.overviewTopology.variant).toBe("overview");
    expect(result.overviewTopology.title).toBe("统一大拓扑");
    expect(metrics.b300).toBe(128);
    expect(metrics.allFlash).toBe(8);
    expect(metrics.hybrid).toBe(16);
    expect(metrics.management).toBe(8);
    expect(metrics.computeSupported).toBe(true);
    expect(metrics.storageEnabled).toBe(true);
    expect(metrics.computeFromB300).toBe(true);
    expect(metrics.storageFromB300).toBe(true);
    expect(metrics.storageFromAllFlash).toBe(true);
    expect(metrics.inbandFromManagement).toBe(true);
    expect(metrics.oobFromManagement).toBe(true);
    expect(metrics.oobManagedDeviceCount).toBe(130);
  });

  it("removes zero-count optional servers from overview source participation", () => {
    const result = calculateAll({
      ...base,
      allFlashServers: 0,
      hybridStorageServers: 0,
      managementServers: 0
    });
    const metrics = result.overviewTopology.metrics as Record<string, number | boolean | string>;

    expect(metrics.allFlash).toBe(0);
    expect(metrics.hybrid).toBe(0);
    expect(metrics.management).toBe(0);
    expect(metrics.computeFromB300).toBe(true);
    expect(metrics.storageFromB300).toBe(true);
    expect(metrics.storageFromAllFlash).toBe(false);
    expect(metrics.inbandFromB300).toBe(true);
    expect(metrics.inbandFromAllFlash).toBe(false);
    expect(metrics.inbandFromHybrid).toBe(false);
    expect(metrics.inbandFromManagement).toBe(false);
    expect(metrics.oobFromB300).toBe(true);
    expect(metrics.oobFromAllFlash).toBe(false);
    expect(metrics.oobFromHybrid).toBe(false);
    expect(metrics.oobFromManagement).toBe(false);
  });

  it("marks overview storage as disabled when no storage NICs are configured", () => {
    const result = calculateAll({
      ...base,
      gpuStoragePortsPerServer: 0,
      allFlashStoragePortsPerServer: 0
    });
    const metrics = result.overviewTopology.metrics as Record<string, number | boolean | string>;

    expect(metrics.storageEnabled).toBe(false);
    expect(metrics.storageLeaf).toBe(0);
    expect(metrics.storageSpine).toBe(0);
    expect(metrics.storageFromB300).toBe(false);
    expect(metrics.storageFromAllFlash).toBe(false);
  });

  it("marks overview compute as unsupported when B300 count exceeds two-tier limit", () => {
    const result = calculateAll({ ...base, b300Servers: 225 });
    const metrics = result.overviewTopology.metrics as Record<string, number | boolean | string>;

    expect(metrics.computeSupported).toBe(false);
    expect(Number(metrics.computeLeaf)).toBeGreaterThan(0);
    expect(Number(metrics.computeSpine)).toBeGreaterThan(0);
    expect(metrics.computeFromB300).toBe(true);
  });
});
