import type { OverviewTopologyMetrics } from "../types";
import { centeredStartPositions } from "./topologyLayout";

export type OverviewServerKey = "b300" | "allFlash" | "hybrid" | "management";
export type OverviewTargetKey = "compute" | "storage" | "inband" | "oob";

export interface OverviewLegendItem {
  color: string;
  label: string;
  dashed?: boolean;
}

export interface OverviewZone {
  key: "security" | "compute" | "storage" | "inband" | "oob" | "servers";
  title: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
  h: number;
  className: string;
}

export interface OverviewDevice {
  key: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  tone: "blue" | "cyan" | "silver" | "graphite";
  size?: number;
}

export interface OverviewSourceLine {
  x: number;
  y: number;
}

export interface OverviewServerChassis {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverviewNicPort {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverviewNicGroup {
  key: OverviewTargetKey;
  label: string;
  count: number;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ports: OverviewNicPort[];
  anchor: OverviewSourceLine;
}

export interface OverviewServerGroup {
  key: OverviewServerKey;
  title: string;
  detail: string;
  count: number;
  x: number;
  y: number;
  w: number;
  h: number;
  chassis: OverviewServerChassis;
  nicGroups: OverviewNicGroup[];
  sourceAnchors: Partial<Record<OverviewTargetKey, OverviewSourceLine>>;
}

export interface OverviewSourceLink {
  key: string;
  source: OverviewServerKey;
  target: OverviewTargetKey;
  color: string;
  dashed?: boolean;
  path: Array<[number, number]>;
}

export interface OverviewStateNotice {
  title: string;
  detail: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverviewManagedObject {
  title: string;
  detail: string;
  items: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverviewInternalLink {
  key: string;
  color: string;
  dashed?: boolean;
  path: Array<[number, number]>;
}

export interface OverviewTopologyViewModel {
  canvasW: number;
  canvasH: number;
  zones: OverviewZone[];
  legendItems: OverviewLegendItem[];
  securityDevices: OverviewDevice[];
  computeDevices: OverviewDevice[];
  storageDevices: OverviewDevice[];
  inbandDevices: OverviewDevice[];
  oobDevices: OverviewDevice[];
  serverGroups: OverviewServerGroup[];
  sourceLinks: OverviewSourceLink[];
  internalLinks: OverviewInternalLink[];
  computeState?: OverviewStateNotice;
  storageState?: OverviewStateNotice;
  oobManagedObject?: OverviewManagedObject;
  serverZoneNote: string;
  showServerSourceCallout: boolean;
  footnote: string;
  computeSources: OverviewServerKey[];
  storageSources: OverviewServerKey[];
  inbandSources: OverviewServerKey[];
  oobSources: OverviewServerKey[];
}

export const OVERVIEW_COLORS = {
  compute: "#ff1f1f",
  storage: "#4b86d9",
  inband: "#22b8e4",
  security: "#f08a29",
  oob: "#9098a7",
  border: "#a8c36a"
} as const;

const CANVAS_W = 1380;
const CANVAS_H = 1090;
const SERVER_BOX_W = 320;
const SERVER_BOX_H = 188;
const SERVER_BOX_GAP = 20;
const SERVER_Y = 462;
const TOP_NIC_LANE_Y = SERVER_Y + 10;
const BOTTOM_NIC_LANE_Y = SERVER_Y + 112;
const NIC_LANE_GAP = 14;

interface OverviewServerDefinition {
  key: OverviewServerKey;
  title: string;
  detail: string;
  count: number;
  nicCounts: Partial<Record<OverviewTargetKey, number>>;
}

function serverDefinitions(metrics: OverviewTopologyMetrics): OverviewServerDefinition[] {
  return [
    {
      key: "b300",
      title: "B300 GPU 服务器",
      detail: "8 计算 / 2 存储 / 2 带内 / 1 带外",
      count: metrics.b300,
      nicCounts: {
        compute: 8,
        storage: metrics.storageEnabled ? metrics.gpuStoragePortsPerServer : 0,
        inband: 2,
        oob: 1
      }
    },
    {
      key: "allFlash",
      title: "全闪服务器",
      detail: "2 存储 / 2 带内 / 1 带外",
      count: metrics.allFlash,
      nicCounts: {
        storage: metrics.storageEnabled ? metrics.allFlashStoragePortsPerServer : 0,
        inband: 2,
        oob: 1
      }
    },
    {
      key: "hybrid",
      title: "混闪服务器",
      detail: "2 带内 / 1 带外",
      count: metrics.hybrid,
      nicCounts: {
        inband: 2,
        oob: 1
      }
    },
    {
      key: "management",
      title: "管理服务器",
      detail: "2 带内 / 1 带外",
      count: metrics.management,
      nicCounts: {
        inband: 2,
        oob: 1
      }
    }
  ];
}

function buildSourceKeys(metrics: OverviewTopologyMetrics, target: OverviewTargetKey): OverviewServerKey[] {
  const counts = new Map(serverDefinitions(metrics).map((group) => [group.key, group.count]));
  const hasServers = (key: OverviewServerKey) => (counts.get(key) ?? 0) > 0;

  if (target === "compute") {
    return metrics.computeSupported && metrics.computeFromB300 && hasServers("b300") ? ["b300"] : [];
  }

  if (target === "storage") {
    if (!metrics.storageEnabled) {
      return [];
    }
    const result: OverviewServerKey[] = [];
    if (metrics.storageFromB300 && hasServers("b300")) result.push("b300");
    if (metrics.storageFromAllFlash && hasServers("allFlash")) result.push("allFlash");
    return result;
  }

  if (target === "inband") {
    const result: OverviewServerKey[] = [];
    if (metrics.inbandFromB300 && hasServers("b300")) result.push("b300");
    if (metrics.inbandFromAllFlash && hasServers("allFlash")) result.push("allFlash");
    if (metrics.inbandFromHybrid && hasServers("hybrid")) result.push("hybrid");
    if (metrics.inbandFromManagement && hasServers("management")) result.push("management");
    return result;
  }

  const result: OverviewServerKey[] = [];
  if (metrics.oobFromB300 && hasServers("b300")) result.push("b300");
  if (metrics.oobFromAllFlash && hasServers("allFlash")) result.push("allFlash");
  if (metrics.oobFromHybrid && hasServers("hybrid")) result.push("hybrid");
  if (metrics.oobFromManagement && hasServers("management")) result.push("management");
  return result;
}

function portGroupWidth(count: number): number {
  if (count <= 1) return 32;
  if (count <= 2) return 52;
  if (count <= 4) return 72;
  return Math.min(102, count * 8 + Math.max(0, count - 1) * 2 + 12);
}

function buildPorts(clusterX: number, y: number, count: number): OverviewNicPort[] {
  const gap = count >= 6 ? 2 : 3;
  const portW = count >= 6 ? 7 : 10;
  const clusterW = count * portW + Math.max(0, count - 1) * gap;
  const startX = clusterX + Math.max(0, Math.floor((portGroupWidth(count) - clusterW) / 2));

  return Array.from({ length: count }, (_, index) => ({
    x: startX + index * (portW + gap),
    y,
    w: portW,
    h: 14
  }));
}

function buildNicGroups(
  nicDefs: Array<{ key: OverviewTargetKey; label: string; count: number; color: string }>,
  x: number,
  laneY: number,
  anchorSide: "top" | "bottom"
): OverviewNicGroup[] {
  const widths = nicDefs.map((item) => Math.max(54, portGroupWidth(item.count)));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * NIC_LANE_GAP;
  const startX = x + Math.floor((SERVER_BOX_W - totalWidth) / 2);
  let cursorX = startX;

  return nicDefs.map((nic, index) => {
    const width = widths[index];
    const ports = buildPorts(cursorX, laneY + 12, nic.count);
    const firstPort = ports[0];
    const lastPort = ports[ports.length - 1];
    const anchorX = firstPort && lastPort ? (firstPort.x + lastPort.x + lastPort.w) / 2 : cursorX + width / 2;
    const group: OverviewNicGroup = {
      key: nic.key,
      label: nic.label,
      count: nic.count,
      color: nic.color,
      x: cursorX,
      y: laneY,
      w: width,
      h: 30,
      ports,
      anchor: {
        x: anchorX,
        y: anchorSide === "bottom" ? laneY + 30 : laneY
      }
    };
    cursorX += width + NIC_LANE_GAP;
    return group;
  });
}

function buildServerGroup(definition: OverviewServerDefinition, x: number): OverviewServerGroup {
  const nicDefs = [
    { key: "compute" as const, label: "计算", count: definition.nicCounts.compute ?? 0, color: OVERVIEW_COLORS.compute },
    { key: "storage" as const, label: "存储", count: definition.nicCounts.storage ?? 0, color: OVERVIEW_COLORS.storage },
    { key: "inband" as const, label: "带内", count: definition.nicCounts.inband ?? 0, color: OVERVIEW_COLORS.inband },
    { key: "oob" as const, label: "带外", count: definition.nicCounts.oob ?? 0, color: OVERVIEW_COLORS.oob }
  ].filter((item) => item.count > 0);

  const chassis: OverviewServerChassis = {
    x: x + 26,
    y: SERVER_Y + 52,
    w: SERVER_BOX_W - 52,
    h: 36
  };

  const topNicGroups = buildNicGroups(
    nicDefs.filter((nic) => nic.key === "inband"),
    x,
    TOP_NIC_LANE_Y,
    "top"
  );
  const bottomNicGroups = buildNicGroups(
    nicDefs.filter((nic) => nic.key === "compute" || nic.key === "storage" || nic.key === "oob"),
    x,
    BOTTOM_NIC_LANE_Y,
    "bottom"
  );
  const nicGroups = [...bottomNicGroups, ...topNicGroups];

  const sourceAnchors = nicGroups.reduce<Partial<Record<OverviewTargetKey, OverviewSourceLine>>>((acc, group) => {
    acc[group.key] = group.anchor;
    return acc;
  }, {});

  return {
    key: definition.key,
    title: definition.title,
    detail: definition.detail,
    count: definition.count,
    x,
    y: SERVER_Y,
    w: SERVER_BOX_W,
    h: SERVER_BOX_H,
    chassis,
    nicGroups,
    sourceAnchors
  };
}

function lowerAnchor(device: OverviewDevice): [number, number] {
  const size = device.size ?? 48;
  return [device.x + size / 2, device.y + size];
}

function upperAnchor(device: OverviewDevice): [number, number] {
  const size = device.size ?? 48;
  return [device.x + size / 2, device.y];
}

function midRightAnchor(device: OverviewDevice): [number, number] {
  const size = device.size ?? 48;
  return [device.x + size, device.y + size / 2];
}

function midLeftAnchor(device: OverviewDevice): [number, number] {
  const size = device.size ?? 48;
  return [device.x, device.y + size / 2];
}

function pairLinks(
  left: OverviewDevice | undefined,
  right: OverviewDevice | undefined,
  color: string,
  dashed = false
): OverviewInternalLink[] {
  if (!left || !right) return [];
  const leftAnchor = midRightAnchor(left);
  const rightAnchor = midLeftAnchor(right);
  return [0, 1].map((offset) => ({
    key: `${left.key}-${right.key}-${offset}`,
    color,
    dashed,
    path: [
      [leftAnchor[0], leftAnchor[1] - 5 + offset * 10],
      [rightAnchor[0], rightAnchor[1] - 5 + offset * 10]
    ]
  }));
}

function fanLinks(
  sources: OverviewDevice[],
  targets: OverviewDevice[],
  color: string,
  keyPrefix: string,
  dashed = false
): OverviewInternalLink[] {
  return sources.flatMap((source) =>
    targets.map((target) => ({
      key: `${keyPrefix}-${source.key}-${target.key}`,
      color,
      dashed,
      path: [lowerAnchor(source), upperAnchor(target)]
    }))
  );
}

function linkPath(source: [number, number], target: [number, number], laneY: number): Array<[number, number]> {
  return [
    [source[0], source[1]],
    [source[0], laneY],
    [target[0], laneY],
    [target[0], target[1]]
  ];
}

function lowerPortAnchor(device: OverviewDevice, index: number, total: number): [number, number] {
  const size = device.size ?? 48;
  return [device.x + (size / (total + 1)) * (index + 1), device.y + size];
}

function upperPortAnchor(device: OverviewDevice, index: number, total: number): [number, number] {
  const size = device.size ?? 48;
  return [device.x + (size / (total + 1)) * (index + 1), device.y];
}

function borderCorePath(border: OverviewDevice, core: OverviewDevice, borderIndex: number, coreIndex: number): Array<[number, number]> {
  const source = lowerPortAnchor(border, coreIndex, 2);
  const target = upperPortAnchor(core, borderIndex, 2);
  const laneY = 314 + borderIndex * 4 + coreIndex * 2;
  return [
    source,
    [source[0], laneY],
    [target[0], laneY],
    target
  ];
}

function sourcePath(source: OverviewSourceLine, target: [number, number], laneY: number): Array<[number, number]> {
  return [
    [source.x, source.y],
    [source.x, laneY],
    [target[0], laneY],
    [target[0], target[1]]
  ];
}

function targetPoints(devices: OverviewDevice[]): Array<[number, number]> {
  return devices.map((device) => upperAnchor(device));
}

function pickTarget(points: Array<[number, number]>, index: number): [number, number] | undefined {
  if (points.length === 0) return undefined;
  return points[Math.min(index, points.length - 1)];
}

export function buildOverviewTopologyViewModel(metrics: OverviewTopologyMetrics): OverviewTopologyViewModel {
  const computeSources = buildSourceKeys(metrics, "compute");
  const storageSources = buildSourceKeys(metrics, "storage");
  const inbandSources = buildSourceKeys(metrics, "inband");
  const oobSources = buildSourceKeys(metrics, "oob");

  const zones: OverviewZone[] = [
    {
      key: "security",
      title: "安全出口区域",
      subtitle: "边界交换机 / 防火墙 / Border",
      x: 430,
      y: 112,
      w: 340,
      h: 260,
      className: "zone-security"
    },
    {
      key: "compute",
      title: "高性能无损 RoCE 网络（计算）",
      subtitle: metrics.computeSupported ? `${metrics.computeSpine} 台 Spine / ${metrics.computeLeaf} 台 Leaf` : "二层计算网本阶段不生成",
      x: 40,
      y: 790,
      w: 352,
      h: 190,
      className: "zone-compute zone-dashed"
    },
    {
      key: "storage",
      title: "高性能无损 RoCE 网络（存储）",
      subtitle: metrics.storageEnabled ? `${metrics.storageSpine} 台 Spine / ${metrics.storageLeaf} 台 Leaf` : "未配置 400G 存储网卡",
      x: 414,
      y: 790,
      w: 334,
      h: 190,
      className: "zone-storage"
    },
    {
      key: "inband",
      title: "带内管理网络",
      subtitle: `${metrics.inbandCore} 台核心 / ${metrics.inbandLeaf} 台接入 Leaf`,
      x: 840,
      y: 286,
      w: 250,
      h: 154,
      className: "zone-inband"
    },
    {
      key: "oob",
      title: "带外管理网络",
      subtitle: `${metrics.oobAccess} 台接入 / ${metrics.oobAggregation} 台汇聚`,
      x: 1010,
      y: 790,
      w: 300,
      h: 230,
      className: "zone-oob"
    },
    {
      key: "servers",
      title: "服务器源区",
      subtitle: "计算/存储从服务器下侧网卡接入下方 Leaf",
      x: 20,
      y: 448,
      w: CANVAS_W - 40,
      h: 236,
      className: "zone overview-source-zone"
    }
  ];

  const securityDevices: OverviewDevice[] = [
    { key: "edge1", label: "Edge1", detail: "", x: 548, y: 146, tone: "silver", size: 48 },
    { key: "edge2", label: "Edge2", detail: "", x: 634, y: 146, tone: "silver", size: 48 },
    { key: "fw1", label: "FW1", detail: "", x: 548, y: 220, tone: "graphite", size: 48 },
    { key: "fw2", label: "FW2", detail: "", x: 634, y: 220, tone: "graphite", size: 48 },
    { key: "border1", label: "BRD1", detail: "", x: 548, y: 294, tone: "cyan", size: 48 },
    { key: "border2", label: "BRD2", detail: "", x: 634, y: 294, tone: "cyan", size: 48 },
    { key: "core1", label: "Core1", detail: "", x: 888, y: 326, tone: "blue", size: 48 },
    { key: "core2", label: "Core2", detail: "", x: 996, y: 326, tone: "blue", size: 48 }
  ];
  const computeSpineY = metrics.computeLeaf > 0 ? 918 : 844;

  const computeDevices: OverviewDevice[] = metrics.computeSupported
    ? [
        ...(metrics.computeLeaf > 0
          ? [
              { key: "compute-leaf-1", label: "LEAF", detail: "", x: 74, y: 844, tone: "blue" as const, size: 44 },
              { key: "compute-leaf-2", label: "LEAF", detail: "", x: 156, y: 844, tone: "blue" as const, size: 44 },
              { key: "compute-leaf-3", label: "LEAF", detail: "", x: 238, y: 844, tone: "blue" as const, size: 44 },
              { key: "compute-leaf-4", label: "LEAF", detail: "", x: 320, y: 844, tone: "blue" as const, size: 44 }
            ]
          : []),
        ...(metrics.computeSpine > 0
          ? [
              { key: "compute-spine-1", label: "SPIN", detail: "", x: 142, y: computeSpineY, tone: "silver" as const, size: 48 },
              { key: "compute-spine-2", label: "SPIN", detail: "", x: 224, y: computeSpineY, tone: "silver" as const, size: 48 }
            ]
          : [])
      ]
    : [];

  const storageDevices: OverviewDevice[] = metrics.storageEnabled
    ? [
        ...(metrics.storageLeaf > 0
          ? [
              { key: "storage-leaf-1", label: "LEAF", detail: "", x: 454, y: 844, tone: "blue" as const, size: 44 },
              { key: "storage-leaf-2", label: "LEAF", detail: "", x: 536, y: 844, tone: "blue" as const, size: 44 },
              { key: "storage-leaf-3", label: "LEAF", detail: "", x: 618, y: 844, tone: "blue" as const, size: 44 },
              { key: "storage-leaf-4", label: "LEAF", detail: "", x: 700, y: 844, tone: "blue" as const, size: 44 }
            ]
          : []),
        ...(metrics.storageSpine > 0
          ? [
              { key: "storage-spine-1", label: "SPIN", detail: "", x: 520, y: 918, tone: "silver" as const, size: 48 },
              { key: "storage-spine-2", label: "SPIN", detail: "", x: 602, y: 918, tone: "silver" as const, size: 48 }
            ]
          : [])
      ]
    : [];

  const inbandDevices: OverviewDevice[] = [
    { key: "inband-access-1", label: "Leaf", detail: "", x: 892, y: 394, tone: "blue", size: 42 },
    { key: "inband-access-2", label: "Leaf", detail: "", x: 1000, y: 394, tone: "blue", size: 42 }
  ];

  const oobDevices: OverviewDevice[] = [
    { key: "oob-access-1", label: "OOB接入", detail: "", x: 1046, y: 842, tone: "blue", size: 42 },
    { key: "oob-access-2", label: "OOB接入", detail: "", x: 1136, y: 842, tone: "blue", size: 42 },
    { key: "oob-agg-1", label: "OOB汇聚", detail: "", x: 1046, y: 928, tone: "blue", size: 42 },
    { key: "oob-agg-2", label: "OOB汇聚", detail: "", x: 1136, y: 928, tone: "blue", size: 42 }
  ];

  const visibleServers = serverDefinitions(metrics).filter((group) => group.count > 0);
  const showServerSourceCallout = visibleServers.some((group) => group.key === "allFlash");
  const serverXs = centeredStartPositions(visibleServers.length, SERVER_BOX_W, SERVER_BOX_GAP, CANVAS_W);
  const serverGroups = visibleServers.map((group, index) => buildServerGroup(group, serverXs[index]));

  const computeLeaves = computeDevices.filter((device) => device.key.includes("-leaf-"));
  const computeSpines = computeDevices.filter((device) => device.key.includes("-spine-"));
  const storageLeaves = storageDevices.filter((device) => device.key.includes("-leaf-"));
  const storageSpines = storageDevices.filter((device) => device.key.includes("-spine-"));
  const inbandAccesses = inbandDevices;
  const oobAccesses = oobDevices.filter((device) => device.key.includes("-access-"));
  const oobAggs = oobDevices.filter((device) => device.key.includes("-agg-"));

  const securityLinks: OverviewInternalLink[] = [
    ...pairLinks(securityDevices[0], securityDevices[1], OVERVIEW_COLORS.border),
    ...pairLinks(securityDevices[2], securityDevices[3], OVERVIEW_COLORS.security),
    ...fanLinks(securityDevices.slice(0, 2), securityDevices.slice(2, 4), OVERVIEW_COLORS.border, "edge-fw"),
    ...fanLinks(securityDevices.slice(2, 4), securityDevices.slice(4, 6), OVERVIEW_COLORS.border, "fw-border")
  ];

  const computeLinks: OverviewInternalLink[] = metrics.computeSupported
    ? [
        ...pairLinks(computeSpines[0], computeSpines[1], OVERVIEW_COLORS.compute),
        ...fanLinks(computeLeaves, computeSpines, OVERVIEW_COLORS.compute, "compute")
      ]
    : [];

  const storageLinks: OverviewInternalLink[] = metrics.storageEnabled
    ? [
        ...pairLinks(storageSpines[0], storageSpines[1], OVERVIEW_COLORS.storage),
        ...fanLinks(storageLeaves, storageSpines, OVERVIEW_COLORS.storage, "storage")
      ]
    : [];

  const inbandLinks: OverviewInternalLink[] = [
    ...pairLinks(securityDevices[6], securityDevices[7], OVERVIEW_COLORS.security),
    ...pairLinks(inbandAccesses[0], inbandAccesses[1], OVERVIEW_COLORS.inband),
    ...securityDevices.slice(4, 6).flatMap((border, borderIndex) =>
      securityDevices.slice(6, 8).map((core, coreIndex) => ({
        key: `border-core-${border.key}-${core.key}`,
        color: OVERVIEW_COLORS.security,
        path: borderCorePath(border, core, borderIndex, coreIndex)
      }))
    ),
    ...securityDevices.slice(6, 8).flatMap((device, index) => {
      const target = inbandAccesses[index];
      return target
        ? [
            {
              key: `core-leaf-${device.key}-${target.key}`,
              color: OVERVIEW_COLORS.inband,
              path: linkPath(lowerAnchor(device), upperAnchor(target), 384)
            }
          ]
        : [];
    })
  ];

  const oobManagedObject: OverviewManagedObject = {
    title: "管理对象",
    detail: `${metrics.oobManagedDeviceCount} 个网络/安全设备管理口`,
    items: ["服务器 BMC", "网络/安全设备管理口"],
    x: 1210,
    y: 900,
    w: 134,
    h: 62
  };

  const oobLinks: OverviewInternalLink[] = [
    ...pairLinks(oobAggs[0], oobAggs[1], OVERVIEW_COLORS.oob, true),
    ...fanLinks(oobAccesses, oobAggs, OVERVIEW_COLORS.oob, "oob", true),
    ...oobAccesses.map((device, index) => {
      const [targetX, targetY] = [
        oobManagedObject.x + 28 + index * 56,
        oobManagedObject.y + 2
      ];
      return {
        key: `oob-managed-${device.key}`,
        color: OVERVIEW_COLORS.oob,
        dashed: true,
        path: [
          lowerAnchor(device),
          [device.x + (device.size ?? 42) / 2, 990],
          [targetX, 990],
          [targetX, targetY]
        ] as Array<[number, number]>
      };
    })
  ];

  const computeTargetPoints = targetPoints(computeLeaves.length > 0 ? computeLeaves : computeSpines);
  const storageTargetPoints = targetPoints(storageLeaves);
  const inbandTargetPoints = targetPoints(inbandAccesses);
  const oobTargetPoints = targetPoints(oobAccesses);

  const sourceLinks: OverviewSourceLink[] = [];

  computeSources.forEach((source, index) => {
    const serverGroup = serverGroups.find((group) => group.key === source);
    const target = pickTarget(computeTargetPoints, index * 2);
    const anchor = serverGroup?.sourceAnchors.compute;
    if (!serverGroup || !target || !anchor) return;
    sourceLinks.push({
      key: `${source}-compute`,
      source,
      target: "compute",
      color: OVERVIEW_COLORS.compute,
      path: sourcePath(anchor, target, 754)
    });
  });

  storageSources.forEach((source, index) => {
    const serverGroup = serverGroups.find((group) => group.key === source);
    const target = pickTarget(storageTargetPoints, index * 2);
    const anchor = serverGroup?.sourceAnchors.storage;
    if (!serverGroup || !target || !anchor) return;
    sourceLinks.push({
      key: `${source}-storage`,
      source,
      target: "storage",
      color: OVERVIEW_COLORS.storage,
      path: sourcePath(anchor, target, 762)
    });
  });

  inbandSources.forEach((source, index) => {
    const serverGroup = serverGroups.find((group) => group.key === source);
    const target = pickTarget(inbandTargetPoints, index % inbandTargetPoints.length);
    const anchor = serverGroup?.sourceAnchors.inband;
    if (!serverGroup || !target || !anchor) return;
    sourceLinks.push({
      key: `${source}-inband`,
      source,
      target: "inband",
      color: OVERVIEW_COLORS.inband,
      path: sourcePath(anchor, target, 430)
    });
  });

  oobSources.forEach((source, index) => {
    const serverGroup = serverGroups.find((group) => group.key === source);
    const target = pickTarget(oobTargetPoints, index % oobTargetPoints.length);
    const anchor = serverGroup?.sourceAnchors.oob;
    if (!serverGroup || !target || !anchor) return;
    sourceLinks.push({
      key: `${source}-oob`,
      source,
      target: "oob",
      color: OVERVIEW_COLORS.oob,
      dashed: true,
      path: sourcePath(anchor, target, 770)
    });
  });

  const computeState = metrics.computeSupported
    ? undefined
    : {
        title: "二层计算网本阶段不生成",
        detail: "本轮统一图仅保留 B300 计算网卡作为来源关系，不展开 Spine / Leaf。",
        x: 68,
        y: 846,
        w: 294,
        h: 68
      };

  const storageState = metrics.storageEnabled
    ? undefined
    : {
        title: "未配置 400G 存储网卡",
        detail: "统一图不绘制存储 Spine / Leaf，只保留服务器参与关系。",
        x: 446,
        y: 846,
        w: 272,
        h: 68
      };

  return {
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    zones,
    legendItems: [
      { color: OVERVIEW_COLORS.compute, label: "无损训练网络缆线 400G" },
      { color: OVERVIEW_COLORS.storage, label: "全闪存储网络缆线 400G" },
      { color: OVERVIEW_COLORS.inband, label: "带内管理网络缆线 25G" },
      { color: OVERVIEW_COLORS.oob, label: "带外管理网络缆线 1G", dashed: true },
      { color: OVERVIEW_COLORS.security, label: "管理区出口网络缆线" }
    ],
    securityDevices,
    computeDevices,
    storageDevices,
    inbandDevices,
    oobDevices,
    serverGroups,
    sourceLinks,
    internalLinks: [...securityLinks, ...computeLinks, ...storageLinks, ...inbandLinks, ...oobLinks],
    computeState,
    storageState,
    oobManagedObject,
    serverZoneNote: "",
    showServerSourceCallout,
    footnote: "统一大拓扑只表达代表性设备与链路方向，不展开全部物理互联。",
    computeSources,
    storageSources,
    inbandSources,
    oobSources
  };
}
