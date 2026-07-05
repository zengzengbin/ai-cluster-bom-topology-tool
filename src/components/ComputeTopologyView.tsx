import type { Topology } from "../types";

type MetricValue = number | string | boolean | undefined;

interface Props {
  topology: Topology;
}

interface PodLayout {
  podIndex: number;
  x: number;
  width: number;
  start: number;
  end: number;
  actual: number;
  leafCount: number;
  leavesPerPlane: number;
}

interface LeafPair {
  label: number;
  leftX: number;
  rightX: number;
  centerX: number;
}

const LEAF_BLOCK_WIDTH = 32;
const LEAF_BLOCK_HEIGHT = 30;

function metric(topology: Topology, key: string, fallback: MetricValue = 0): MetricValue {
  return topology.metrics?.[key] ?? fallback;
}

function numberMetric(topology: Topology, key: string): number {
  const value = metric(topology, key, 0);
  return typeof value === "number" ? value : Number(value) || 0;
}

function boolMetric(topology: Topology, key: string): boolean {
  return metric(topology, key, true) !== false;
}

function visibleIndexes(count: number): Array<number | "gap"> {
  if (count <= 4) {
    return Array.from({ length: count }, (_, index) => index);
  }
  return [0, 1, 2, "gap", count - 1];
}

function visibleSpineLabels(count: number): Array<number | "gap"> {
  if (count <= 4) {
    return Array.from({ length: count }, (_, index) => index + 1);
  }
  return [1, 2, 3, "gap", count];
}

function compactSpineLabels(count: number): Array<number | "gap"> {
  if (count <= 2) {
    return Array.from({ length: count }, (_, index) => index + 1);
  }
  return [1, "gap", count];
}

function roundUpToEvenLocal(value: number): number {
  const rounded = Math.ceil(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function baseLeafCountForPod(actualServers: number, virtualDualPlane: boolean): number {
  if (actualServers <= 0) {
    return 0;
  }
  if (!virtualDualPlane) {
    return 16;
  }
  return roundUpToEvenLocal(actualServers / 2);
}

function leafCountsForPods(totalLeaf: number, podActuals: number[], virtualDualPlane: boolean): number[] {
  const counts = podActuals.map((actualServers) => baseLeafCountForPod(actualServers, virtualDualPlane));
  const activeIndexes = counts.map((count, index) => (count > 0 ? index : -1)).filter((index) => index >= 0);
  if (activeIndexes.length === 0) {
    return counts;
  }

  let remaining = Math.max(0, totalLeaf - counts.reduce((sum, count) => sum + count, 0));
  let cursor = 0;
  while (remaining > 0) {
    const increment = remaining >= 2 ? 2 : 1;
    counts[activeIndexes[cursor % activeIndexes.length]] += increment;
    remaining -= increment;
    cursor += 1;
  }
  return counts;
}

function representativeLeafLabels(leavesPerPlane: number): number[] {
  if (leavesPerPlane <= 0) {
    return [];
  }
  if (leavesPerPlane === 1) {
    return [1];
  }
  if (leavesPerPlane === 2) {
    return [1, 2];
  }
  return [1, 2, leavesPerPlane];
}

function spreadCenters(start: number, width: number, count: number): number[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [start + width / 2];
  }
  const step = width / (count - 1);
  return Array.from({ length: count }, (_, index) => start + step * index);
}

function centeredSlots(widths: number[], center: number): number[] {
  if (widths.length === 0) {
    return [];
  }
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const start = center - totalWidth / 2;
  let cursor = start;
  return widths.map((width) => {
    const position = cursor + width / 2;
    cursor += width;
    return position;
  });
}

function buildLeafPairs(pod: PodLayout): LeafPair[] {
  const labels = representativeLeafLabels(pod.leavesPerPlane);
  const pairCenters =
    labels.length === 3
      ? [pod.x + 44, pod.x + pod.width / 2, pod.x + pod.width - 44]
      : spreadCenters(pod.x + pod.width / 2 - 56, 112, labels.length);
  return labels.map((label, index) => ({
    label,
    centerX: pairCenters[index],
    leftX: pairCenters[index] - 22,
    rightX: pairCenters[index] + 22
  }));
}

function serverLabelsForPod(pod: PodLayout): number[] {
  if (pod.actual <= 1) {
    return [pod.start];
  }
  if (pod.actual === 2) {
    return [pod.start, pod.end];
  }
  return [pod.start, Math.min(pod.start + 1, pod.end), pod.end];
}

function directServerLabels(b300: number): number[] {
  if (b300 <= 1) {
    return [1];
  }
  if (b300 === 2) {
    return [1, 2];
  }
  if (b300 === 3) {
    return [1, 2, 3];
  }
  return [1, 2, b300];
}

export function ComputeTopologyView({ topology }: Props) {
  const b300 = numberMetric(topology, "b300");
  const cx8 = numberMetric(topology, "cx8");
  const pods = numberMetric(topology, "pods");
  const leaf = numberMetric(topology, "leaf");
  const spine = numberMetric(topology, "spine");
  const supported = boolMetric(topology, "supported");
  const virtualDualPlane = boolMetric(topology, "virtualDualPlane");
  const directSpine = boolMetric(topology, "directSpine");

  if (!supported) {
    return (
      <div className="topology-scroll">
        <svg viewBox="0 0 800 360" role="img" aria-label={topology.title} className="topology-svg detailed-topology">
          <rect x="40" y="40" width="720" height="280" rx="18" className="zone-warning" />
          <text x="400" y="160" textAnchor="middle" className="topology-title-large">
            B300 数量超过 224 台
          </text>
          <text x="400" y="208" textAnchor="middle" className="topology-note">
            第一阶段不生成二层计算网拓扑，三层组网后续支持。
          </text>
          <text x="400" y="248" textAnchor="middle" className="topology-info">
            当前 B300 = {b300} 台
          </text>
        </svg>
      </div>
    );
  }

  if (directSpine) {
    return <DirectSpineTopology b300={b300} cx8={cx8} />;
  }

  if (!virtualDualPlane) {
    return <PhysicalDualPlaneTopology topology={topology} />;
  }

  const podIndexes = visibleIndexes(pods);
  const podWidth = 260;
  const podGap = 16;
  const gapWidth = 42;
  const sectionPadding = 40;
  const contentWidth = podIndexes.reduce<number>((sum, item, index) => {
    const width = item === "gap" ? gapWidth : podWidth;
    return sum + width + (index === 0 ? 0 : podGap);
  }, 0);
  const canvasW = Math.max(1220, contentWidth + sectionPadding * 2);
  const left = (canvasW - contentWidth) / 2;
  const canvasH = 660;
  const spineY = 112;
  const leafY = 312;
  const podY = 404;
  const spineLabels = pods <= 2 ? compactSpineLabels(spine) : visibleSpineLabels(spine);
  const spineSlotWidths = spineLabels.map((entry) => (entry === "gap" ? 60 : 116));
  const spineCenters = centeredSlots(spineSlotWidths, canvasW / 2);
  const spineEntries = spineLabels.map((label, index) => ({ label, x: spineCenters[index] }));
  const podActuals = Array.from({ length: pods }, (_, index) => {
    const start = index * 32 + 1;
    const end = Math.min(b300, (index + 1) * 32);
    return Math.max(0, end - start + 1);
  });
  const podLeafCounts = leafCountsForPods(leaf, podActuals, virtualDualPlane);

  const podLayouts: PodLayout[] = [];
  let cursor = left;
  for (const item of podIndexes) {
    if (item === "gap") {
      cursor += gapWidth + podGap;
      continue;
    }
    const start = item * 32 + 1;
    const end = Math.min(b300, (item + 1) * 32);
    const actual = Math.max(0, end - start + 1);
    const leafCount = podLeafCounts[item] ?? baseLeafCountForPod(actual, virtualDualPlane);
    podLayouts.push({
      podIndex: item,
      x: cursor,
      width: podWidth,
      start,
      end,
      actual,
      leafCount,
      leavesPerPlane: Math.max(1, leafCount / 2)
    });
    cursor += podWidth + podGap;
  }

  return (
    <div className="topology-scroll">
      <svg
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        role="img"
        aria-label={topology.title}
        className="topology-svg detailed-topology"
        style={{ minWidth: `${canvasW}px` }}
      >
        <defs>
          <marker id="vrf-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#7c2dd6" />
          </marker>
        </defs>

        <rect x="24" y="24" width={canvasW - 48} height="158" rx="12" className="zone zone-compute" />
        <text x="44" y="56" className="zone-heading">
          核心层 Spine
        </text>
        <text x={canvasW - 44} y="56" textAnchor="end" className="zone-sub">
          {virtualDualPlane ? "虚拟双平面：每台 Spine 内 P1 与 P2 互指" : "物理双平面：P1 与 P2 独立设备"}
        </text>

        {spineEntries.map((entry, index) => {
          if (entry.label === "gap") {
            return (
              <g key={`spine-gap-${index}`}>
                <text x={entry.x} y={spineY + 24} textAnchor="middle" className="ellipsis-text">
                  ...
                </text>
              </g>
            );
          }
          return (
            <SpinePair
              key={`spine-${entry.label}`}
              x={entry.x - 48}
              y={spineY}
              label={`Spine ${entry.label}`}
              virtualDualPlane={virtualDualPlane}
            />
          );
        })}

        <rect x="24" y="222" width={canvasW - 48} height="126" rx="12" className="zone zone-compute" />
        <text x="44" y="254" className="zone-heading">
          接入层 Leaf
        </text>
        <text x={canvasW - 44} y="254" textAnchor="end" className="zone-sub">
          共 {leaf} 台 Leaf；按清单数量分配到各 POD
        </text>

        {podLayouts.map((pod) => {
          const leafPairs = buildLeafPairs(pod);
          return (
            <g key={`leaf-${pod.podIndex}`}>
              {leafPairs.map((pair) => (
                <g key={`pair-${pod.podIndex}-${pair.label}`}>
                  <LeafBlock x={pair.leftX - LEAF_BLOCK_WIDTH / 2} y={leafY} plane={1} label={`P1-L${pair.label}`} />
                  <LeafBlock x={pair.rightX - LEAF_BLOCK_WIDTH / 2} y={leafY} plane={2} label={`P2-L${pair.label}`} />
                </g>
              ))}
            </g>
          );
        })}

        {spineEntries
          .filter((entry): entry is { label: number; x: number } => entry.label !== "gap")
          .flatMap((spineEntry) =>
            podLayouts.flatMap((pod) =>
              buildLeafPairs(pod).flatMap((pair) => [
                <path
                  key={`sl-${spineEntry.label}-${pod.podIndex}-${pair.label}-p1`}
                  d={`M ${spineEntry.x} ${spineY + 50} C ${spineEntry.x} 220, ${pair.leftX} 228, ${pair.leftX} ${leafY}`}
                  fill="none"
                  stroke="#6ea8fe"
                  strokeWidth="1"
                  opacity="0.34"
                />,
                <path
                  key={`sl-${spineEntry.label}-${pod.podIndex}-${pair.label}-p2`}
                  d={`M ${spineEntry.x} ${spineY + 50} C ${spineEntry.x} 220, ${pair.rightX} 228, ${pair.rightX} ${leafY}`}
                  fill="none"
                  stroke="#6ea8fe"
                  strokeWidth="1"
                  opacity="0.34"
                />
              ])
            )
          )}

        {podIndexes.map((item, index) => {
          if (item === "gap") {
            const previousWidth = podIndexes.slice(0, index).reduce<number>((sum, value, innerIndex) => {
              const width = value === "gap" ? gapWidth : podWidth;
              return sum + width + (innerIndex === 0 ? 0 : podGap);
            }, 0);
            const x = left + previousWidth;
            return (
              <g key={`pod-gap-${index}`}>
                <rect x={x} y={podY} width={gapWidth} height="170" rx="10" fill="rgba(245,247,250,0.4)" stroke="#9aa3b1" strokeDasharray="6 6" />
                <text x={x + gapWidth / 2} y={podY + 82} textAnchor="middle" className="ellipsis-text">
                  ...
                </text>
              </g>
            );
          }

          const pod = podLayouts.find((entry) => entry.podIndex === item);
          if (!pod) {
            return null;
          }

          const serverLabels = serverLabelsForPod(pod);
          const serverXs = spreadCenters(pod.x + 58, pod.width - 116, serverLabels.length);
          const leafPairs = buildLeafPairs(pod);
          const visibleNics = leafPairs.map((pair) => ({
            nic: pair.label,
            xs: [pair.leftX, pair.rightX]
          }));

          return (
            <g key={`pod-${item}`} className="pod-group">
              <rect x={pod.x} y={podY} width={pod.width} height="170" rx="10" className="pod-frame" />
              <text x={pod.x + 16} y={podY + 28} className="pod-label">
                POD {item + 1}
              </text>
              <text x={pod.x + pod.width - 16} y={podY + 28} textAnchor="end" className="device-sublabel">
                {pod.actual} 台 / 8xCX8
              </text>

              {serverXs.map((x, serverIndex) => (
                <g key={`server-${pod.podIndex}-${serverIndex}`}>
                  <ServerNodeWithNics x={x - 33} y={podY + 54} label={String(serverLabels[serverIndex])} />
                  {visibleNics.flatMap((target) =>
                    target.xs.map((leafX, leafIndex) => (
                      <path
                        key={`server-link-${pod.podIndex}-${serverIndex}-${target.nic}-${leafIndex}`}
                        d={`M ${x - 33 + (target.nic - 1) * 8 + 3.5} ${podY + 54} C ${x - 33 + (target.nic - 1) * 8 + 3.5} ${podY + 10}, ${leafX} ${leafY + 54}, ${leafX} ${leafY + 34}`}
                        fill="none"
                        stroke="#6ea8fe"
                        strokeWidth="1"
                        opacity="0.34"
                      />
                    ))
                  )}
                </g>
              ))}

              <text x={pod.x + 16} y={podY + 136} className="device-sublabel">
                服务器 {pod.start}~{pod.end}；每台 8 张 CX8
              </text>
              <text x={pod.x + 16} y={podY + 154} className="device-sublabel">
                {`本 POD Leaf ${pod.leafCount} 台；P1/P2 各 ${pod.leavesPerPlane} 台`}
              </text>
            </g>
          );
        })}

        <rect x="24" y={canvasH - 48} width={canvasW - 48} height="32" rx="6" fill="#f0f2f5" stroke="#b0b8c4" strokeWidth="1" />
        <text x="40" y={canvasH - 27} className="device-sublabel">
          蓝色连线示意服务器 1/2/末号代表网卡分别上联对应 Leaf；省略中间同类链路
        </text>
        <text x={canvasW - 40} y={canvasH - 27} textAnchor="end" className="device-sublabel">
          B300={b300} 台；POD={pods}；Leaf={leaf} 台；Spine={spine} 台
        </text>
      </svg>
    </div>
  );
}

function SpinePair({ x, y, label, virtualDualPlane }: { x: number; y: number; label: string; virtualDualPlane: boolean }) {
  return (
    <g>
      {virtualDualPlane && (
        <>
          <path
            d={`M ${x + 20} ${y - 12} C ${x + 36} ${y - 26}, ${x + 58} ${y - 26}, ${x + 74} ${y - 12}`}
            fill="none"
            stroke="#7c2dd6"
            strokeWidth="1.6"
            strokeDasharray="3 3"
            markerStart="url(#vrf-arrow)"
            markerEnd="url(#vrf-arrow)"
          />
          <text x={x + 46} y={y - 31} textAnchor="middle" className="device-sublabel" fill="#7c2dd6">
            P1/P2 互指
          </text>
        </>
      )}
      <rect x={x} y={y} width="44" height="36" className="plane-p1" />
      <rect x={x + 48} y={y} width="44" height="36" className="plane-p2" />
      <rect x={x - 6} y={y - 8} width="104" height="56" className="plane-dashed" />
      <text x={x + 22} y={y + 23} textAnchor="middle" className="plane-text">
        P1
      </text>
      <text x={x + 70} y={y + 23} textAnchor="middle" className="plane-text">
        P2
      </text>
      <text x={x + 46} y={y + 58} textAnchor="middle" className="device-sublabel">
        {label}
      </text>
    </g>
  );
}

function PlaneSpineNode({ x, y, label, plane }: { x: number; y: number; label: string; plane: 1 | 2 }) {
  return (
    <g>
      <rect x={x} y={y} width="58" height="30" className={plane === 1 ? "plane-p1" : "plane-p2"} />
      <text x={x + 29} y={y + 19} textAnchor="middle" className="leaf-text compute-leaf-text">
        {label}
      </text>
    </g>
  );
}

function PhysicalDualPlaneTopology({ topology }: { topology: Topology }) {
  const b300 = numberMetric(topology, "b300");
  const pods = numberMetric(topology, "pods");
  const leaf = numberMetric(topology, "leaf");
  const spine = numberMetric(topology, "spine");
  const spinePerPlane = Math.max(1, spine / 2);
  const podIndexes = visibleIndexes(pods);
  const podWidth = 260;
  const podGap = 20;
  const gapWidth = 42;
  const sectionPadding = 40;
  const contentWidth = podIndexes.reduce<number>((sum, item, index) => {
    const width = item === "gap" ? gapWidth : podWidth;
    return sum + width + (index === 0 ? 0 : podGap);
  }, 0);
  const canvasW = Math.max(1280, contentWidth + sectionPadding * 2);
  const left = (canvasW - contentWidth) / 2;
  const canvasH = 720;
  const spineY = 114;
  const leafY = 354;
  const podY = 462;
  const labels = visibleSpineLabels(spinePerPlane);
  const planeW = 480;
  const planeGap = 88;
  const plane1X = canvasW / 2 - planeW - planeGap / 2;
  const plane2X = canvasW / 2 + planeGap / 2;
  const slotWidths = labels.map((entry) => (entry === "gap" ? 54 : 82));
  const p1Spines = labels.map((label, index) => ({ label, x: centeredSlots(slotWidths, plane1X + planeW / 2)[index] }));
  const p2Spines = labels.map((label, index) => ({ label, x: centeredSlots(slotWidths, plane2X + planeW / 2)[index] }));
  const podLeafCounts = Array.from({ length: pods }, (_, index) => {
    const start = index * 32 + 1;
    const end = Math.min(b300, (index + 1) * 32);
    const actual = Math.max(0, end - start + 1);
    return baseLeafCountForPod(actual, false);
  });
  const podLayouts: PodLayout[] = [];
  let cursor = left;

  for (const item of podIndexes) {
    if (item === "gap") {
      cursor += gapWidth + podGap;
      continue;
    }
    const start = item * 32 + 1;
    const end = Math.min(b300, (item + 1) * 32);
    const actual = Math.max(0, end - start + 1);
    const leafCount = podLeafCounts[item] ?? baseLeafCountForPod(actual, false);
    podLayouts.push({
      podIndex: item,
      x: cursor,
      width: podWidth,
      start,
      end,
      actual,
      leafCount,
      leavesPerPlane: Math.max(1, leafCount / 2)
    });
    cursor += podWidth + podGap;
  }

  return (
    <div className="topology-scroll">
      <svg viewBox={`0 0 ${canvasW} ${canvasH}`} role="img" aria-label={topology.title} className="topology-svg detailed-topology" style={{ minWidth: `${canvasW}px` }}>
        <rect x="24" y="24" width={canvasW - 48} height="212" rx="12" className="zone zone-compute" />
        <text x="44" y="56" className="zone-heading">核心层 Spine</text>
        <text x={canvasW - 44} y="56" textAnchor="end" className="zone-sub">
          物理双平面：P1 与 P2 各 {spinePerPlane} 台 Spine；同号 Spine 之间保留逃生链路
        </text>
        <rect x={plane1X} y="78" width={planeW} height="128" rx="10" className="plane-dashed" />
        <rect x={plane2X} y="78" width={planeW} height="128" rx="10" className="plane-dashed" />
        <text x={plane1X + 18} y="102" className="device-sublabel">平面 1：P1-S1 ~ P1-S{spinePerPlane}</text>
        <text x={plane2X + 18} y="102" className="device-sublabel">平面 2：P2-S1 ~ P2-S{spinePerPlane}</text>

        {p1Spines.map((entry, index) =>
          entry.label === "gap" ? (
            <text key={`p1-gap-${index}`} x={entry.x} y={spineY + 20} textAnchor="middle" className="ellipsis-text">...</text>
          ) : (
            <PlaneSpineNode key={`p1-${entry.label}`} x={entry.x - 29} y={spineY} plane={1} label={`P1-S${entry.label}`} />
          )
        )}
        {p2Spines.map((entry, index) =>
          entry.label === "gap" ? (
            <text key={`p2-gap-${index}`} x={entry.x} y={spineY + 20} textAnchor="middle" className="ellipsis-text">...</text>
          ) : (
            <PlaneSpineNode key={`p2-${entry.label}`} x={entry.x - 29} y={spineY} plane={2} label={`P2-S${entry.label}`} />
          )
        )}
        {p1Spines
          .filter((entry): entry is { label: number; x: number } => entry.label !== "gap")
          .map((entry, index) => {
            const peer = p2Spines.find((item) => item.label === entry.label);
            if (!peer || peer.label === "gap") return null;
            return Array.from({ length: 8 }).map((_, lineIndex) => {
              const y = spineY - lineIndex * 1.8;
              const controlY = spineY - 46 - lineIndex * 1.8;
              return (
                <path
                  key={`escape-${entry.label}-${lineIndex}`}
                  d={`M ${entry.x} ${y} C ${entry.x + 80} ${controlY}, ${peer.x - 80} ${controlY}, ${peer.x} ${y}`}
                  fill="none"
                  stroke="#7c2dd6"
                  strokeWidth="0.8"
                  strokeDasharray="5 4"
                  opacity={index === 0 ? 0.45 : 0.18}
                />
              );
            });
          })}

        <rect x="24" y="270" width={canvasW - 48} height="126" rx="12" className="zone zone-compute" />
        <text x="44" y="302" className="zone-heading">接入层 Leaf</text>
        <text x={canvasW - 44} y="302" textAnchor="end" className="zone-sub">
          共 {leaf} 台 Leaf；P1 Leaf 上联 P1 Spine，P2 Leaf 上联 P2 Spine
        </text>
        {podLayouts.map((pod) =>
          buildLeafPairs(pod).map((pair) => (
            <g key={`leaf-${pod.podIndex}-${pair.label}`}>
              <LeafBlock x={pair.leftX - LEAF_BLOCK_WIDTH / 2} y={leafY} plane={1} label={`P1-L${pair.label}`} />
              <LeafBlock x={pair.rightX - LEAF_BLOCK_WIDTH / 2} y={leafY} plane={2} label={`P2-L${pair.label}`} />
            </g>
          ))
        )}
        {podLayouts.flatMap((pod) =>
          buildLeafPairs(pod).flatMap((pair) => [
            ...p1Spines
              .filter((entry): entry is { label: number; x: number } => entry.label !== "gap")
              .map((spineEntry) => <path key={`p1-sl-${pod.podIndex}-${pair.label}-${spineEntry.label}`} d={`M ${spineEntry.x} ${spineY + 34} C ${spineEntry.x} 242, ${pair.leftX} 258, ${pair.leftX} ${leafY}`} fill="none" stroke="#6ea8fe" strokeWidth="1" opacity="0.3" />),
            ...p2Spines
              .filter((entry): entry is { label: number; x: number } => entry.label !== "gap")
              .map((spineEntry) => <path key={`p2-sl-${pod.podIndex}-${pair.label}-${spineEntry.label}`} d={`M ${spineEntry.x} ${spineY + 34} C ${spineEntry.x} 242, ${pair.rightX} 258, ${pair.rightX} ${leafY}`} fill="none" stroke="#6ea8fe" strokeWidth="1" opacity="0.3" />)
          ])
        )}

        {podIndexes.map((item, index) => {
          if (item === "gap") {
            const previousWidth = podIndexes.slice(0, index).reduce<number>((sum, value, innerIndex) => {
              const width = value === "gap" ? gapWidth : podWidth;
              return sum + width + (innerIndex === 0 ? 0 : podGap);
            }, 0);
            const x = left + previousWidth;
            return (
              <g key={`pod-gap-${index}`}>
                <rect x={x} y={podY} width={gapWidth} height="170" rx="10" fill="rgba(245,247,250,0.4)" stroke="#9aa3b1" strokeDasharray="6 6" />
                <text x={x + gapWidth / 2} y={podY + 82} textAnchor="middle" className="ellipsis-text">...</text>
              </g>
            );
          }
          const pod = podLayouts.find((entry) => entry.podIndex === item);
          if (!pod) return null;
          const serverLabels = serverLabelsForPod(pod);
          const serverXs = spreadCenters(pod.x + 56, pod.width - 112, serverLabels.length);
          const leafPairs = buildLeafPairs(pod);
          return (
            <g key={`pod-${item}`} className="pod-group">
              <rect x={pod.x} y={podY} width={pod.width} height="170" rx="10" className="pod-frame" />
              <text x={pod.x + 16} y={podY + 28} className="pod-label">POD {item + 1}</text>
              <text x={pod.x + pod.width - 16} y={podY + 28} textAnchor="end" className="device-sublabel">{pod.actual} 台 / 8xCX8</text>
              {serverXs.map((x, serverIndex) => (
                <g key={`physical-server-${pod.podIndex}-${serverIndex}`}>
                  <ServerNodeWithNics x={x - 33} y={podY + 54} label={String(serverLabels[serverIndex])} />
                  {leafPairs.flatMap((pair) =>
                    [pair.leftX, pair.rightX].map((leafX, leafIndex) => (
                      <path key={`physical-server-link-${pod.podIndex}-${serverIndex}-${pair.label}-${leafIndex}`} d={`M ${x - 33 + (pair.label - 1) * 8 + 3.5} ${podY + 54} C ${x - 33 + (pair.label - 1) * 8 + 3.5} ${podY + 18}, ${leafX} ${leafY + 52}, ${leafX} ${leafY + 34}`} fill="none" stroke="#6ea8fe" strokeWidth="1" opacity="0.32" />
                    ))
                  )}
                </g>
              ))}
              <text x={pod.x + 16} y={podY + 136} className="device-sublabel">服务器 {pod.start}~{pod.end}；每台 8 张 CX8</text>
              <text x={pod.x + 16} y={podY + 154} className="device-sublabel">本 POD Leaf {pod.leafCount} 台；P1/P2 各 {pod.leavesPerPlane} 台</text>
            </g>
          );
        })}
        <rect x="24" y={canvasH - 48} width={canvasW - 48} height="32" rx="6" fill="#f0f2f5" stroke="#b0b8c4" strokeWidth="1" />
        <text x="40" y={canvasH - 27} className="device-sublabel">蓝色线表示同平面代表链路；紫色细线表示同号 P1/P2 Spine 间 8 条逃生链路</text>
        <text x={canvasW - 40} y={canvasH - 27} textAnchor="end" className="device-sublabel">B300={b300} 台；POD={pods}；Leaf={leaf} 台；Spine={spine} 台</text>
      </svg>
    </div>
  );
}

function DirectSpineTopology({ b300, cx8 }: { b300: number; cx8: number }) {
  const canvasW = 980;
  const canvasH = 520;
  const spineY = 98;
  const podY = 300;
  const serverLabels = directServerLabels(b300);
  const serverLeft = b300 <= 2 ? 406 : 352;
  const serverWidth = b300 <= 2 ? 168 : 208;
  const serverXs = spreadCenters(serverLeft, serverWidth, serverLabels.length);
  const spineCenters = [410, 570];
  const spineInterconnect = cx8;
  const interconnectLines = Array.from({ length: Math.min(8, Math.max(1, spineInterconnect)) }, (_, index) => index);

  return (
    <div className="topology-scroll">
      <svg
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        role="img"
        aria-label="计算网拓扑"
        className="topology-svg detailed-topology"
        style={{ minWidth: `${canvasW}px` }}
      >
        <rect x="28" y="24" width={canvasW - 56} height="190" rx="12" className="zone zone-compute" />
        <text x="52" y="58" className="zone-heading">
          双 Spine 直连
        </text>
        <text x={canvasW - 52} y="58" textAnchor="end" className="zone-sub">
          B300 在 1-4 台时不再单独设置 Leaf 层
        </text>

        <SpinePair x={spineCenters[0] - 46} y={spineY} label="Spine 1" virtualDualPlane={false} />
        <SpinePair x={spineCenters[1] - 46} y={spineY} label="Spine 2" virtualDualPlane={false} />

        {interconnectLines.map((_, index) => {
          const y = spineY + 4 + index * (30 / Math.max(1, interconnectLines.length - 1));
          return (
            <line
              key={`inter-${index}`}
              x1={spineCenters[0] + 50}
              y1={y}
              x2={spineCenters[1] - 50}
              y2={y}
              stroke="#7c2dd6"
              strokeWidth="0.8"
              opacity="0.35"
            />
          );
        })}
        <text x={canvasW / 2} y={spineY + 78} textAnchor="middle" className="device-sublabel">
          Spine 横联：{b300 * 8}*400G
        </text>

        <rect x="256" y={podY - 30} width="470" height="170" rx="10" className="pod-frame" />
        <text x="276" y={podY} className="pod-label">
          POD 1
        </text>
        <text x="706" y={podY} textAnchor="end" className="device-sublabel">
          {b300} 台 / 8xCX8
        </text>

        {serverXs.map((x, serverIndex) => (
          <g key={`direct-server-${serverIndex}`}>
            <ServerNodeWithNics x={x} y={podY + 42} label={String(serverLabels[serverIndex])} />
            {spineCenters.map((spineX, spineIndex) => (
              <path
                key={`direct-link-${serverIndex}-${spineIndex}`}
                d={`M ${x + 33} ${podY + 42} C ${x + 33} ${podY - 20}, ${spineX} ${spineY + 86}, ${spineX} ${spineY + 48}`}
                fill="none"
                stroke="#6ea8fe"
                strokeWidth="1"
                opacity="0.42"
              />
            ))}
          </g>
        ))}

        <text x="276" y={podY + 118} className="device-sublabel">
          服务器 1~{b300}；每台 8 张 CX8
        </text>
        <text x="276" y={podY + 136} className="device-sublabel">
          每台 Spine 下行 {b300 * 8} 个接口到服务器（图中仅画代表链路）
        </text>

        <rect x="28" y={canvasH - 48} width={canvasW - 56} height="32" rx="6" fill="#f0f2f5" stroke="#b0b8c4" strokeWidth="1" />
        <text x="44" y={canvasH - 27} className="device-sublabel">
          蓝色连线为服务器到双 Spine 的代表链路；紫色细线为 Spine 横联
        </text>
        <text x={canvasW - 44} y={canvasH - 27} textAnchor="end" className="device-sublabel">
          B300={b300} 台；CX8={cx8}；POD=1；Leaf=0；Spine=2
        </text>
      </svg>
    </div>
  );
}

function LeafBlock({ x, y, plane, label }: { x: number; y: number; plane: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y} width={LEAF_BLOCK_WIDTH} height={LEAF_BLOCK_HEIGHT} className={plane === 1 ? "leaf-p1" : "leaf-p2"} />
      <text x={x + LEAF_BLOCK_WIDTH / 2} y={y + 19} textAnchor="middle" className="leaf-text compute-leaf-text">
        {label}
      </text>
    </g>
  );
}

function ServerNodeWithNics({ x, y, label }: { x: number; y: number; label: string }) {
  const nicColors = ["#ff0f0f", "#ff7a1a", "#7c2dd6", "#f5cf00", "#1e90ff", "#38bdf8", "#67c23a", "#f9b4bd"];
  return (
    <g>
      {nicColors.map((color, index) => (
        <g key={color}>
          <rect x={x + index * 8} y={y} width="7" height="28" fill={color} />
          <text x={x + index * 8 + 3.5} y={y + 18} textAnchor="middle" className="nic-text">
            {index + 1}
          </text>
        </g>
      ))}
      <rect x={x - 4} y={y + 28} width="74" height="20" className="server-base" />
      <text x={x + 33} y={y + 42} textAnchor="middle" className="server-label">
        {label}
      </text>
    </g>
  );
}
