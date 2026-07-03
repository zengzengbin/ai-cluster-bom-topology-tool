import { centeredStartPositions } from "./topologyLayout";

export type OobObjectKind =
  | "gpu-bmc"
  | "flash-bmc"
  | "hybrid-bmc"
  | "management-bmc"
  | "network-security-device-mgmt";

export interface OobTopologyInput {
  b300: number;
  allFlash: number;
  hybrid: number;
  management: number;
  upstreamDeviceCount: number;
  access: number;
  totalServers: number;
  oobPorts: number;
}

export interface OobAccessSwitch {
  label: string;
  x: number;
  y: number;
  size: number;
}

export interface OobAggregationSwitch {
  label: string;
  detail: string;
  x: number;
  y: number;
  size: number;
}

export interface OobObjectGroup {
  kind: OobObjectKind;
  title: string;
  detail: string;
  count: number;
  x: number;
  y: number;
  width: number;
  accessIndex: number;
}

export interface OobTopologyViewModel {
  canvasW: number;
  canvasH: number;
  accessCount: number;
  hasCollapsedAccess: boolean;
  ellipsis: { x: number; y: number };
  aggregationSwitches: OobAggregationSwitch[];
  accessSwitches: OobAccessSwitch[];
  objectGroups: OobObjectGroup[];
  accessAggPaths: Array<Array<[number, number]>>;
  aggregationStackPaths: Array<Array<[number, number]>>;
  aggregationCorePaths: Array<Array<[number, number]>>;
  accessObjectPaths: Array<Array<[number, number]>>;
  summary: string;
}

export function buildOobTopologyViewModel(input: OobTopologyInput): OobTopologyViewModel {
  const accessCount = clamp(Math.max(input.access, 1), 1, 12);
  const visibleAccessCount = Math.min(accessCount, 5);
  const hasCollapsedAccess = accessCount > visibleAccessCount;
  const canvasW = 1120;
  const canvasH = 760;
  const aggregationY = 106;
  const accessY = 318;
  const objectY = 586;
  const switchSize = 48;
  const objectWidth = 178;
  const accessXs = visibleAccessCount <= 2
    ? centeredStartPositions(visibleAccessCount, switchSize, 224, canvasW)
    : evenlySpaced(96, 976, visibleAccessCount);
  const aggregationSwitches: OobAggregationSwitch[] = [
    { label: "OOB 汇聚 A", detail: "上联", x: 400, y: aggregationY, size: switchSize },
    { label: "OOB 汇聚 B", detail: "冗余", x: 672, y: aggregationY, size: switchSize }
  ];

  const accessSwitches = accessXs.map((x, index) => ({
    label: `OOB Access ${hasCollapsedAccess && index === visibleAccessCount - 1 ? accessCount : index + 1}`,
    x,
    y: accessY,
    size: switchSize
  }));
  const ellipsis = {
    x: hasCollapsedAccess ? (accessSwitches[visibleAccessCount - 2].x + accessSwitches[visibleAccessCount - 1].x + switchSize) / 2 : 0,
    y: accessY + switchSize / 2 + 4
  };

  const candidateObjectGroups: Array<Omit<OobObjectGroup, "x">> = [
    {
      kind: "gpu-bmc",
      title: "GPU 服务器 BMC",
      detail: `${input.b300} 台`,
      count: input.b300,
      y: objectY,
      width: objectWidth,
      accessIndex: 0
    },
    {
      kind: "flash-bmc",
      title: "全闪服务器 BMC",
      detail: `${input.allFlash} 台`,
      count: input.allFlash,
      y: objectY,
      width: objectWidth,
      accessIndex: Math.min(1, accessCount - 1)
    },
    {
      kind: "hybrid-bmc",
      title: "混闪服务器 BMC",
      detail: `${input.hybrid} 台`,
      count: input.hybrid,
      y: objectY,
      width: objectWidth,
      accessIndex: Math.min(2, accessCount - 1)
    },
    {
      kind: "management-bmc",
      title: "管理服务器 BMC",
      detail: `${input.management} 台`,
      count: input.management,
      y: objectY,
      width: objectWidth,
      accessIndex: Math.min(3, accessCount - 1)
    },
    {
      kind: "network-security-device-mgmt",
      title: "网络/安全设备管理口",
      detail: `${input.upstreamDeviceCount} 个`,
      count: input.upstreamDeviceCount,
      y: objectY,
      width: objectWidth,
      accessIndex: visibleAccessCount - 1
    }
  ];
  const visibleObjectGroups = candidateObjectGroups.filter((group) => group.count > 0);
  const objectXs = centeredStartPositions(visibleObjectGroups.length, objectWidth, 36, canvasW);
  const objectGroups: OobObjectGroup[] = visibleObjectGroups.map((group, index) => ({
    ...group,
    x: objectXs[index]
  }));

  const [aggregationA, aggregationB] = aggregationSwitches;
  const fanoutY = 226;
  const aggregationDownlinkAnchors = accessCount <= 1
    ? [
        aggregationA.x + aggregationA.size / 2 - 4,
        aggregationB.x + aggregationB.size / 2 + 4
      ]
    : [
        aggregationA.x + aggregationA.size / 2 - 12,
        aggregationA.x + aggregationA.size / 2 + 4,
        aggregationB.x + aggregationB.size / 2 - 4,
        aggregationB.x + aggregationB.size / 2 + 12
      ];
  const accessAggPaths: Array<Array<[number, number]>> = [
    ...aggregationDownlinkAnchors.map((x) => [
      [x, aggregationA.y + aggregationA.size],
      [x, fanoutY]
    ] as Array<[number, number]>),
    ...accessSwitches.flatMap((sw) =>
      [
        [
          [sw.x + 17, sw.y],
          [aggregationA.x + aggregationA.size / 2 - 4, fanoutY]
        ],
        [
          [sw.x + 31, sw.y],
          [aggregationB.x + aggregationB.size / 2 + 4, fanoutY]
        ]
      ] as Array<Array<[number, number]>>
    )
  ];

  const aggregationStackPaths: Array<Array<[number, number]>> = [118, 128].map((y) => [
    [aggregationA.x + aggregationA.size, y],
    [aggregationB.x, y]
  ]);

  const aggregationCorePaths: Array<Array<[number, number]>> = aggregationSwitches.flatMap((sw) => {
    const center = sw.x + sw.size / 2;
    return [
      [
        [center - 8, sw.y],
        [center - 8, 64]
      ],
      [
        [center + 8, sw.y],
        [center + 8, 64]
      ]
    ] as Array<Array<[number, number]>>;
  });

  const accessObjectPaths = objectGroups.map((group) => {
    const accessSwitch = accessSwitches[group.accessIndex];
    const objectX = group.x + group.width / 2;
    const accessX = accessSwitch.x + accessSwitch.size / 2;
    return [
      [objectX, group.y],
      [accessX, accessSwitch.y + accessSwitch.size]
    ] as Array<[number, number]>;
  });
  accessSwitches.forEach((sw, index) => {
    if (objectGroups.length === 0) return;
    if (accessObjectPaths.some((path) => path[path.length - 1][0] === sw.x + sw.size / 2)) return;
    const targetGroup = objectGroups[Math.min(index, objectGroups.length - 1)];
    const objectX = targetGroup.x + targetGroup.width / 2;
    const accessX = sw.x + sw.size / 2;
    accessObjectPaths.push([
      [objectX, targetGroup.y],
      [accessX, sw.y + sw.size]
    ]);
  });

  return {
    canvasW,
    canvasH,
    accessCount,
    hasCollapsedAccess,
    ellipsis,
    aggregationSwitches,
    accessSwitches,
    objectGroups,
    accessAggPaths,
    aggregationStackPaths,
    aggregationCorePaths,
    accessObjectPaths,
    summary: `服务器 BMC ${input.totalServers} + 网络/安全设备管理口 ${input.upstreamDeviceCount} = ${input.oobPorts} 个带外端口`
  };
}

function evenlySpaced(start: number, end: number, count: number): number[] {
  if (count === 1) return [(start + end) / 2];
  const gap = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + index * gap);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
