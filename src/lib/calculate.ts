import type { BomItem, CalculationResult, InputState, NetworkResult, OverviewTopologyMetrics, TopologyLink, TopologyNode } from "../types";
import { ceilDivide, roundUpPowerOfTwo, roundUpToEven } from "./math";
import { descriptions } from "./products";
import { makeTopology, overviewTopology } from "./topology";

const COMPUTE_MAX_B300 = 224;

function item(
  network: string,
  sequence: string,
  productName: string,
  model: string,
  description: string,
  quantity: number | string,
  formula: string
): BomItem {
  return { network, sequence, productName, model, description, quantity, formula };
}

export function calculateCompute(input: InputState): NetworkResult {
  const cx8Count = input.b300Servers * 8;
  const supported = input.b300Servers <= COMPUTE_MAX_B300;
  const directSpine = supported && input.b300Servers <= 4;
  const virtualDualPlane = supported && !directSpine && input.b300Servers <= 128;
  const pods = directSpine ? 1 : ceilDivide(input.b300Servers, 32);
  const leaf = directSpine ? 0 : virtualDualPlane ? roundUpToEven((cx8Count * 2) / 32) : pods * 16;
  const spine = directSpine ? 2 : roundUpPowerOfTwo(leaf / 2);
  const lpo = leaf * 32 * 2;
  const leafDown = cx8Count * 2;
  const spineInterconnect = cx8Count * 2;
  const spineEscapeModule = spine * 8;
  const sm10Description = "MPO 光纤跳线，MPO8/APC-MPO8/APC，Female，单模，OS2，B 型，8 芯，长度 10M。";
  const server800 = cx8Count;
  const serverFibers = cx8Count * 2;
  const smFiber = lpo / 4;

  const network = "计算网";
  const items: BomItem[] = supported
    ? directSpine
      ? [
          item(network, "1", "计算网 SPINE 交换机", "RG-S6990-64QC2XS", descriptions.s6990, spine, "实际一台就够，考虑避免单点故障为 2 台。"),
          item(network, "3", "SPINE互联光模块", "400G-Q112-DR4-L", descriptions.dr4, spineInterconnect, "CX8 网卡数 * 2。"),
          item(network, "4", "SPINE间互联光纤-50米", "MPO-MPO-SM-10M(APC)", descriptions.sm50, spineInterconnect / 2, "SPINE 互联光模块 / 2。"),
          item(network, "5", "SPINE下联光模块", "400G-Q112-VR4-MM850", descriptions.vr4, leafDown, "CX8 网卡数 * 2。"),
          item(network, "6", "服务器侧 800G 光模块", "800G-OSFP-RHS-2VR4-MM850", descriptions.osfp800, server800, "CX8 网卡数。"),
          item(network, "7", "交换机-服务器互联光纤", "MPO-MPO-OM4-30M(APC)", descriptions.om4, serverFibers, "CX8 网卡数 * 2。")
        ]
      : [
          item(network, "1", "计算网 SPINE 交换机", "RG-S6990-64QC2XS", descriptions.s6990, spine, "LEAF 数量 / 2，向上取 2 的幂。"),
          item(network, "2", "计算网 LEAF 交换机", "RG-S6990-64QC2XS", descriptions.s6990, leaf, virtualDualPlane ? "CX8 网卡总数 * 2 / 32，除不尽时向上取整数偶数。" : "POD 数 * 16；POD 数 = B300 数量 / 32 向上取整。"),
          item(network, "3", "SPINE-LEAF 互联 LPO 光模块", "400G-Q112-DR4-L", descriptions.dr4, lpo, "LEAF 数量 * 32 * 2。"),
          item(network, "4", "SPINE-LEAF 互联光纤-50 米", "MPO-MPO-SM-50M(APC)", descriptions.sm50, smFiber, "SPINE-LEAF 互联 LPO 光模块 / 4。"),
          item(network, "5", "SPINE-LEAF 互联光纤-100 米", "MPO-MPO-SM-100M(APC)", descriptions.sm100, smFiber, "SPINE-LEAF 互联 LPO 光模块 / 4。"),
          item(network, "6", "LEAF 下联光模块", "400G-Q112-VR4-MM850", descriptions.vr4, leafDown, "CX8 总数 * 2。"),
          item(network, "7", "服务器侧 800G 光模块", "800G-OSFP-RHS-2VR4-MM850", descriptions.osfp800, server800, "CX8 总数。"),
          item(network, "8", "交换机-服务器互联光纤", "MPO-MPO-OM4-30M(APC)", descriptions.om4, serverFibers, "CX8 总数 * 2。"),
          ...(!virtualDualPlane
            ? [
                item(network, "9", "SPINE逃生链路 LPO光模块", "400G-Q112-DR4-L", descriptions.dr4, spineEscapeModule, "Spine 数量 * 8。"),
                item(network, "10", "SPINE逃生链路互联光纤-10米", "MPO-MPO-SM-10M(APC)", sm10Description, spineEscapeModule / 2, "SPINE 逃生链路 LPO 光模块数量 / 2。")
              ]
            : [])
        ]
    : [
        item(network, "-", "二层组网超限提示", "-", "B300 二层组网第一阶段仅支持不超过 224 台。", "暂不生成", "超过 224 台时提示三层组网后续支持。")
      ];

  const nodes: TopologyNode[] = [
    { id: "server", label: "B300 GPU", detail: `${input.b300Servers} 台 / ${cx8Count} 张 CX8`, x: 80, y: 210, tone: "graphite" },
    { id: "leaf", label: "计算 LEAF", detail: supported ? `${leaf} 台` : "超出二层范围", x: 310, y: 210, tone: "blue" },
    { id: "spine", label: "计算 SPINE", detail: supported ? `${spine} 台` : "三层后续支持", x: 560, y: 210, tone: "cyan" }
  ];
  const links: TopologyLink[] = [
    { from: "server", to: "leaf", label: "800G 下联" },
    { from: "leaf", to: "spine", label: "400G Spine-Leaf" }
  ];

  return {
    key: "compute",
    title: "计算网",
    summary: {
      B300: input.b300Servers,
      CX8: cx8Count,
      组网: supported ? (directSpine ? "双 Spine 直连" : virtualDualPlane ? "虚拟双平面" : "物理双平面") : "超出二层范围",
      POD: supported ? pods : "-",
      LEAF: supported ? leaf : "-",
      SPINE: supported ? spine : "-"
    },
    items,
    topology: makeTopology("计算网拓扑", "B300 二层计算网络，按虚拟/物理双平面生成。", nodes, links, {
      variant: "compute",
      metrics: { b300: input.b300Servers, cx8: cx8Count, pods, leaf, spine, supported, virtualDualPlane, directSpine }
    }),
    notes: supported ? [`当前按 ${directSpine ? "双 Spine 直连" : virtualDualPlane ? "虚拟双平面" : "物理双平面"} 计算。`] : ["B300 数量超过 224 台，三层组网后续支持。"]
  };
}

export function calculateStorage(input: InputState): NetworkResult {
  const gpuPorts400 = input.b300Servers * input.gpuStoragePortsPerServer;
  const allFlashPorts400 = input.allFlashServers * input.allFlashStoragePortsPerServer;
  const ports400 = gpuPorts400 + allFlashPorts400;
  const directLeafPair = ports400 > 0 && ports400 <= 64;
  const leaf = ports400 <= 0 ? 0 : directLeafPair ? 2 : roundUpToEven(ceilDivide(ports400, 32));
  const spine = ports400 > 0 && !directLeafPair ? roundUpPowerOfTwo(leaf / 2) : 0;
  const network = "存储网";
  const supported = ports400 > 0;
  const sm10Description = "MPO 光纤跳线，MPO8/APC-MPO8/APC，Female，单模，OS2，B 型，8 芯，长度 10M。";
  const items: BomItem[] = supported
    ? directLeafPair
      ? [
          item(network, "1", "存储网 Leaf 交换机", "RG-S6990-64QC2XS", descriptions.s6990, leaf, "400G 接入总需求 <= 64 时固定为 2 台 Leaf 横联。"),
          item(network, "2", "LEAF互联光模块", "400G-Q112-DR4-L", descriptions.dr4, ports400, "存储网 400G 接口总需求数。"),
          item(network, "3", "LEAF互联光纤", "MPO-MPO-SM-10M(APC)", sm10Description, ports400 / 2, "存储网 400G 接口总需求数 / 2。"),
          item(network, "4", "LEAF 下联模块", "400G-Q112-VR4-MM850", descriptions.vr4, ports400, "400G 接入总需求。"),
          item(network, "5", "服务器侧 400G 模块", "400G-OSFP-VR4-MM850", descriptions.osfp400, ports400, "400G 接入总需求。"),
          item(network, "6", "LEAF 与服务器互联线缆", "MPO-MPO-OM4-30M(APC)", descriptions.om4, ports400 / 2, "400G 接入总需求 / 2。")
        ]
      : [
          item(network, "1", "存储网 Spine 交换机", "RG-S6990-64QC2XS", descriptions.s6990, spine, "LEAF 数量 / 2，向上取 2 的幂。"),
          item(network, "2", "存储网 Leaf 交换机", "RG-S6990-64QC2XS", descriptions.s6990, leaf, "400G 接入总需求 / 32，向上取偶数。"),
          item(network, "3", "SPINE-LEAF 互联光模块", "400G-Q112-DR4-L", descriptions.dr4, leaf * 32 * 2, "LEAF 数量 * 32 * 2。"),
          item(network, "4", "SPINE-LEAF 互联光纤", "MPO-MPO-SM-50M(APC)", descriptions.sm50, leaf * 32, "SPINE-LEAF 互联光模块 / 2。"),
          item(network, "5", "LEAF 下联模块", "400G-Q112-VR4-MM850", descriptions.vr4, ports400, "400G 接入总需求。"),
          item(network, "6", "服务器侧 400G 模块", "400G-OSFP-VR4-MM850", descriptions.osfp400, ports400, "400G 接入总需求。"),
          item(network, "7", "LEAF 与服务器互联线缆", "MPO-MPO-OM4-30M(APC)", descriptions.om4, ports400 / 2, "400G 接入总需求 / 2。")
        ]
    : [
        item(network, "-", "存储网未配置提示", "-", "未配置任何 400G 存储网卡时，不生成存储网设备清单。", "暂不生成", "GPU 与全闪服务器的存储网卡配置均为 0。")
      ];

  return {
    key: "storage",
    title: "存储网",
    summary: { "400G接入口": ports400, LEAF: leaf, SPINE: spine },
    items,
    topology: makeTopology(
      "存储网拓扑",
      "GPU 与全闪存服务器通过 400G 接入高速存储网络。",
      [
        { id: "servers", label: "GPU + 全闪", detail: `${input.b300Servers + input.allFlashServers} 台`, x: 80, y: 210, tone: "graphite" },
        { id: "leaf", label: "存储 LEAF", detail: `${leaf} 台`, x: 320, y: 210, tone: "cyan" },
        { id: "spine", label: "存储 SPINE", detail: `${spine} 台`, x: 560, y: 210, tone: "blue" }
      ],
      [
        { from: "servers", to: "leaf", label: `${ports400} 个 400G 接入` },
        { from: "leaf", to: "spine", label: "400G Spine-Leaf" }
      ],
      {
        variant: "storage",
        metrics: {
          b300: input.b300Servers,
          allFlash: input.allFlashServers,
          ports400,
          gpuPorts400,
          allFlashPorts400,
          leaf,
          spine,
          supported,
          directLeafPair
        }
      }
    ),
    notes: [
      `400G 接入需求 = GPU ${input.b300Servers} * ${input.gpuStoragePortsPerServer} + 全闪 ${input.allFlashServers} * ${input.allFlashStoragePortsPerServer}。`
    ]
  };
}

export function calculateInband(input: InputState): NetworkResult {
  const totalServers = input.b300Servers + input.allFlashServers + input.hybridStorageServers + input.managementServers;
  const ports25 = totalServers * 2;
  const leaf = roundUpToEven(ceilDivide(ports25, 44));
  const network = "带内管理网";
  const items = [
    item(network, "1", "边界交换机", "RG-S6510-48VS8CQ", `${descriptions.s6510} 含100G AOC线缆2条。`, 2, "固定为 2。"),
    item(network, "2", "防火墙", "RG-WALL 1600-Z8680", `${descriptions.firewall} 含10G AOC线缆2条。`, 2, "固定为 2。"),
    item(network, "3", "带内 border", "RG-S6510-48VS8CQ", `${descriptions.s6510} 含100G AOC线缆2条。`, 2, "固定为 2。"),
    item(network, "4", "带内管理网核心交换机", "RG-S6921-4C", "RG-S6921-4C机箱，含业务卡扩展槽*4，、满配电源,风扇，实配32*100G业务卡一张。含100GAOC线缆2条。", 2, "固定为 2。"),
    item(network, "5", "带内管理网 leaf", "RG-S6510-48VS8CQ", `${descriptions.s6510} 含100G AOC线缆2条。`, leaf, "25G 接口数 / 44，向上取偶数。"),
    item(network, "6", "带内 leaf-核心 100G 互联模块", "100G-QSFP-SR-MM850", descriptions.qsfp100, leaf * 4 + 8, "每台 leaf 上行 2 个 100G，两侧模块为 leaf*4；核心上连 border 另加 8。"),
    item(network, "7", "带内 leaf-核心 100G 互联光纤", "MPO-MPO-OM4-50M", descriptions.mpo50, (leaf * 4 + 8) / 2, "100G 互联模块 / 2。"),
    item(network, "8", "40G 多模光模块", "40G-QSFP-SR-MM850", descriptions.qsfp40, 32, "边界、防火墙、border 互联固定 32。"),
    item(network, "9", "40G 多模光纤", "MPO-MPO-OM4-30M", descriptions.mpo50, 16, "40G 多模光模块 / 2。"),
    item(network, "10", "带内接入交换机侧 25G 多模模块", "VG-SFP-SR-MM850", descriptions.sfp25, ports25, "25G 接口需求。"),
    item(network, "11", "服务器侧 25G 多模模块", "VG-SFP-SR-MM850", descriptions.sfp25, ports25, "25G 接口需求。"),
    item(network, "12", "带内接入-服务器 25G 多模光纤", "LC2-LC2-OM3-30M(UPC)", descriptions.lc30, ports25, "25G 接口需求。")
  ];

  return {
    key: "inband",
    title: "带内管理网",
    summary: { 服务器总数: totalServers, "25G接口": ports25, LEAF: leaf, 核心: 2 },
    items,
    topology: makeTopology(
      "带内管理网拓扑",
      "所有服务器 25G 带内管理口接入业务管理网络。",
      [
        { id: "servers", label: "全部服务器", detail: `${totalServers} 台 / ${ports25} 口`, x: 70, y: 225, tone: "graphite" },
        { id: "leaf", label: "带内 LEAF", detail: `${leaf} 台`, x: 245, y: 225, tone: "silver" },
        { id: "core", label: "管理核心", detail: "2 台", x: 420, y: 225, tone: "blue" },
        { id: "border", label: "Border", detail: "2 台", x: 590, y: 145, tone: "cyan" },
        { id: "firewall", label: "防火墙/边界", detail: "2 + 2", x: 590, y: 305, tone: "graphite" }
      ],
      [
        { from: "servers", to: "leaf", label: "25G" },
        { from: "leaf", to: "core", label: "100G" },
        { from: "core", to: "border", label: "100G" },
        { from: "border", to: "firewall", label: "40G" }
      ],
      {
        variant: "inband",
        metrics: { totalServers, ports25, leaf, core: 2, border: 2, firewall: 2, b300: input.b300Servers, allFlash: input.allFlashServers, hybrid: input.hybridStorageServers, management: input.managementServers }
      }
    ),
    notes: [`25G 接口数 = 全部服务器 ${totalServers} * 2。`]
  };
}

export function calculateOob(input: InputState, upstreamDeviceCount: number): NetworkResult {
  const totalServers = input.b300Servers + input.allFlashServers + input.hybridStorageServers + input.managementServers;
  const oobPorts = totalServers + upstreamDeviceCount;
  const access = ceilDivide(oobPorts, 44);
  const aggregation = 2;
  const aggregationWarning = access > 48 ? "带外接入交换机数量大于 48，需要关注或更换带外汇聚型号。" : "";
  const network = "带外管理网";
  const items = [
    item(network, "1", "带外汇聚交换机", "RG-S6510-48VS8CQ", `${descriptions.s6510} 含100G AOC线缆*2。`, aggregation, "接入交换机不大于 48 时固定为 2；超过时提示关注汇聚型号。"),
    item(network, "2", "带外接入交换机", "RG-S6000C-48GT4XS-E", descriptions.s6000, access, "带外接口总数 / 44，向上取整。"),
    item(network, "3", "带外接入到带外汇聚万兆多模模块", "XG-SFP-SR-MM850", descriptions.sfp10, access * 4, "带外接入交换机 * 4。"),
    item(network, "4", "接入上行万兆光纤", "LC2-LC2-OM3-50M(UPC)", descriptions.lc50, access * 2, "带外接入交换机 * 2。"),
    item(network, "5", "带外汇聚上行 100G 多模模块", "100G-QSFP-iLR4-SM1310", descriptions.ilr4, aggregation * 4, "带外汇聚交换机 * 4。"),
    item(network, "6", "带外汇聚上行 100G 光纤", "LC2-LC2-SM-100M(UPC)", descriptions.lc100, aggregation * 2, "带外汇聚交换机 * 2。"),
    item(network, "7", "网线", "CAT6", descriptions.cat6, oobPorts, "带外接口总数。")
  ];

  return {
    key: "oob",
    title: "带外管理网",
    summary: { 服务器管理口: totalServers, 网络安全设备: upstreamDeviceCount, 带外接口总数: oobPorts, 接入: access, 汇聚: aggregation },
    items,
    topology: makeTopology(
      "带外管理网拓扑",
      "服务器和网络/安全设备管理口统一接入带外管理网络。",
      [
        { id: "ports", label: "管理口汇聚", detail: `${oobPorts} 个接口`, x: 90, y: 225, tone: "graphite" },
        { id: "access", label: "带外接入", detail: `${access} 台`, x: 320, y: 225, tone: "silver" },
        { id: "agg", label: "带外汇聚", detail: `${aggregation} 台`, x: 560, y: 225, tone: "blue" }
      ],
      [
        { from: "ports", to: "access", label: "千兆电口" },
        { from: "access", to: "agg", label: "10G 上行" }
      ],
      {
        variant: "oob",
        metrics: { totalServers, upstreamDeviceCount, oobPorts, access, aggregation, b300: input.b300Servers, allFlash: input.allFlashServers, hybrid: input.hybridStorageServers, management: input.managementServers }
      }
    ),
    notes: [aggregationWarning || "带外接入交换机数量不大于 48，汇聚固定按 2 台计算。"]
  };
}

export function calculateAll(input: InputState): CalculationResult {
  const compute = calculateCompute(input);
  const storage = calculateStorage(input);
  const inband = calculateInband(input);
  const computeDevices = compute.items
    .filter((entry) => typeof entry.quantity === "number" && ["计算网 SPINE 交换机", "计算网 LEAF 交换机"].includes(entry.productName))
    .reduce((sum, entry) => sum + Number(entry.quantity), 0);
  const storageDevices = storage.items
    .filter((entry) => ["存储网 Spine 交换机", "存储网 Leaf 交换机"].includes(entry.productName))
    .reduce((sum, entry) => sum + Number(entry.quantity), 0);
  const inbandDevices = inband.items
    .filter((entry) => ["边界交换机", "防火墙", "带内 border", "带内管理网核心交换机", "带内管理网 leaf"].includes(entry.productName))
    .reduce((sum, entry) => sum + Number(entry.quantity), 0);
  const oob = calculateOob(input, computeDevices + storageDevices + inbandDevices);

  const overviewMetrics: OverviewTopologyMetrics = {
    b300: input.b300Servers,
    allFlash: input.allFlashServers,
    hybrid: input.hybridStorageServers,
    management: input.managementServers,
    gpuStoragePortsPerServer: input.gpuStoragePortsPerServer,
    allFlashStoragePortsPerServer: input.allFlashStoragePortsPerServer,
    computeSupported: compute.topology.metrics?.supported === true,
    storageEnabled: storage.topology.metrics?.supported === true,
    computeLeaf: Number(compute.topology.metrics?.leaf) || 0,
    computeSpine: Number(compute.topology.metrics?.spine) || 0,
    storageLeaf: Number(storage.topology.metrics?.leaf) || 0,
    storageSpine: Number(storage.topology.metrics?.spine) || 0,
    inbandLeaf: Number(inband.topology.metrics?.leaf) || 0,
    inbandCore: 2,
    inbandBorder: 2,
    exitSwitches: 2,
    firewalls: 2,
    oobAccess: Number(oob.topology.metrics?.access) || 0,
    oobAggregation: Number(oob.topology.metrics?.aggregation) || 0,
    oobManagedDeviceCount: computeDevices + storageDevices + inbandDevices,
    computeFromB300: input.b300Servers > 0,
    storageFromB300: input.b300Servers > 0 && input.gpuStoragePortsPerServer > 0,
    storageFromAllFlash: input.allFlashServers > 0 && input.allFlashStoragePortsPerServer > 0,
    inbandFromB300: input.b300Servers > 0,
    inbandFromAllFlash: input.allFlashServers > 0,
    inbandFromHybrid: input.hybridStorageServers > 0,
    inbandFromManagement: input.managementServers > 0,
    oobFromB300: input.b300Servers > 0,
    oobFromAllFlash: input.allFlashServers > 0,
    oobFromHybrid: input.hybridStorageServers > 0,
    oobFromManagement: input.managementServers > 0
  };

  const networks = [compute, storage, inband, oob];
  const warnings = networks.flatMap((network) => network.notes.filter((note) => note.includes("超过") || note.includes("关注")));

  return {
    inputs: input,
    isComputeSupported: input.b300Servers <= COMPUTE_MAX_B300,
    warnings,
    networks,
    overviewTopology: overviewTopology(overviewMetrics)
  };
}
