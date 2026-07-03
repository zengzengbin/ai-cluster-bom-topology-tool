import type { OverviewTopologyMetrics, Topology } from "../types";
import { buildOverviewTopologyViewModel } from "../lib/overviewTopologyViewModel";
import { buildOobTopologyViewModel } from "../lib/oobTopologyViewModel";
import {
  storageLeafSpineTargetIndexes,
  storageServerLeafTargetIndexes,
  storagePortIndexes,
  visibleStorageServerLabels
} from "../lib/storageTopologyViewModel";
import { centeredStartPositions } from "../lib/topologyLayout";
import { ComputeTopologyView } from "./ComputeTopologyView";

interface Props {
  topology: Topology;
}

type MetricValue = number | string | boolean | undefined;

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

export function TopologyDiagram({ topology }: Props) {
  return (
    <section className="topology-card">
      <div className="section-heading">
        <div>
          <h3>{topology.title}</h3>
          <p className="topology-sub">{topology.subtitle}</p>
        </div>
      </div>
      {topology.variant === "compute" && <ComputeTopologyView topology={topology} />}
      {topology.variant === "storage" && <StorageTopology topology={topology} />}
      {topology.variant === "inband" && <InbandTopologyV2 topology={topology} />}
      {topology.variant === "oob" && <OobTopology topology={topology} />}
      {topology.variant === "overview" && <OverviewTopology topology={topology} />}
      {!topology.variant && <FallbackTopology topology={topology} />}
    </section>
  );
}

// ============== Compute Topology ==============
// ============== Compute Topology: Layout Engine (pure data) ==============
type SpinePos = { type: "item" | "gap"; idx?: number; count?: number };
type PodPos = { type: "pod" | "gap"; actualIndex?: number; count?: number };

// 鍘嬬缉鏄剧ず锛?=3 鍏ㄧ敾锛?3 鐢?1, 2, gap, n
function buildSpinePositions(count: number): SpinePos[] {
  if (count <= 3) {
    return Array.from({ length: count }, (_, i) => ({ type: "item", idx: i + 1 }));
  }
  return [
    { type: "item", idx: 1 },
    { type: "item", idx: 2 },
    { type: "gap", count: count - 3 },
    { type: "item", idx: count }
  ];
}

// POD 鍘嬬缉锛?=2 鍏ㄧ敾锛?2 鐢?POD1, POD2, gap, PODn
function buildPodPositions(count: number): PodPos[] {
  if (count <= 5) {
    return Array.from({ length: count }, (_, i) => ({ type: "pod", actualIndex: i }));
  }
  const omitted = count - 3;
  const positions: PodPos[] = [
    { type: "pod", actualIndex: 0 },
    { type: "pod", actualIndex: 1 }
  ];
  if (omitted > 0) {
    positions.push({ type: "gap", count: omitted });
  }
  positions.push({ type: "pod", actualIndex: count - 1 });
  return positions;
}

interface PodLayout {
  kind: "pod" | "gap";
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  subLabel: string;
  note: string;
  note2: string;
  start: number;
  end: number;
  second: number;
  actualServers: number;
  serverNodes: Array<{ x: number; y: number; label: string }>;
}

interface LeafNodeLayout {
  x: number;
  y: number;
  podIdx: number;
  leafLabel: number;
  isFirst: boolean;
  isLast: boolean;
  isGap: boolean;
}

interface SpineNodeLayout {
  x: number;
  y: number;
  label: string;
  kind: "real" | "ellipsis";
  count?: number;
}

interface ComputeLayout {
  canvasW: number;
  canvasH: number;
  spineBox: { x: number; y: number; w: number; h: number; label: string; sub: string };
  leafBox: { x: number; y: number; w: number; h: number; label: string; sub: string };
  spineNodes: SpineNodeLayout[];
  leafNodes: LeafNodeLayout[];
  pods: PodLayout[];
  spineLeafLinks: Array<{ d: string; color: string }>;
  leafServerLinks: Array<{ d: string; color: string }>;
  escapeLink: { d: string; label: string } | null;
}

// === POD Band (bottom) ===
const POD_W = 540;
const POD_GAP = 60;
const POD_GAP_INDICATOR_W = 100;
const POD_X_START = 40;
const POD_BAND_Y = 540;
const POD_BAND_H = 200;
const POD_INNER_LEFT = 30;
const POD_HEADER_H = 50;
const POD_SRV_Y_FIRST = 80;       // first server Y offset inside POD
const POD_SRV_HORIZ_GAP = 20;     // horizontal gap between servers in a row
const POD_FOOTER_Y_OFFSET = 30;   // distance from POD bottom for note lines

// === Spine Band (top) ===
const SPINE_BOX_X = 40;
const SPINE_BOX_Y = 30;
const SPINE_BOX_H = 200;
const SPINE_Y = 150;
const SPINE_INNER_LEFT = 40;

// === Leaf Band (middle, full width) ===
const LEAF_BOX_X = 40;
const LEAF_BOX_Y = 280;
const LEAF_BOX_H = 220;
const LEAF_BAND_INNER_Y = 340;  // leaf blocks Y
const LEAF_BLOCK_W = 44;        // single leaf block width (P1 or P2)
const LEAF_BLOCK_H = 28;
const LEAF_BLOCK_GAP = 6;       // gap between P1 and P2 in same pair
const LEAF_PAIR_GAP = 90;       // gap between leaf pairs in same POD

const LINK_COLOR = "#6ea8fe";
const ESCAPE_COLOR = "#7c2dd6";
function calcComputeLayout(opts: {
  b300: number;
  pods: number;
  leaf: number;
  spine: number;
  virtualDualPlane: boolean;
}): ComputeLayout {
  const { b300, pods, leaf, spine, virtualDualPlane } = opts;

  // ===== POD Band (bottom) =====
  const podPositions = buildPodPositions(pods);
  const visiblePodCount = podPositions.filter(p => p.type === "pod").length;
  const gapCount = podPositions.filter(p => p.type === "gap").length;
  const computedW =
    POD_X_START * 2 +
    visiblePodCount * POD_W +
    Math.max(0, visiblePodCount - 1) * POD_GAP +
    gapCount * POD_GAP_INDICATOR_W;
  const canvasW = Math.max(computedW, 1200);
  const canvasH = 790;

  const podLayouts: PodLayout[] = [];
  let curPodX = POD_X_START;
  const leavesPerPod = Math.ceil(leaf / pods);          // total leaves per POD (e.g. 16)
  const leavesPerPlane = Math.max(leavesPerPod / 2, 1); // leaves per plane (e.g. 8)
  for (const pp of podPositions) {
    if (pp.type === "gap") {
      podLayouts.push({
        kind: "gap",
        x: curPodX,
        y: POD_BAND_Y,
        w: POD_GAP_INDICATOR_W,
        h: POD_BAND_H,
        label: "...",
        subLabel: "鐪佺暐 " + pp.count + " 涓?POD",
        note: "",
        note2: "",
        start: 0,
        end: 0,
        second: 0,
        actualServers: 0,
        serverNodes: []
      });
      curPodX += POD_GAP_INDICATOR_W;
      continue;
    }
    const idx = pp.actualIndex as number;
    const podCapacity = 32;
    const start = idx * podCapacity + 1;
    const end = Math.min(b300, (idx + 1) * podCapacity);
    const actualServers = Math.max(end - start + 1, 0);
    const second = actualServers > 1 ? Math.min(end, start + 1) : start;
    const isPartialPod = actualServers > 0 && actualServers < podCapacity;
    podLayouts.push({
      kind: "pod",
      x: curPodX,
      y: POD_BAND_Y,
      w: POD_W,
      h: POD_BAND_H,
      label: "POD " + (idx + 1),
      subLabel: actualServers + " 鍙>/ 8xCX8",
      note: "鏈嶅姟鍣?" + start + "~" + end + " 路 16 涓?400G 鍙?鍙?",
      note2: isPartialPod
        ? "鏈粍涓嶈冻 " + podCapacity + " 鍙帮紝Leaf 浠嶆寜 " + leavesPerPod + " 鍙伴厤缃?"
        : "婊＄粍 " + podCapacity + " 鍙?路 B300 瀵瑰簲 " + leavesPerPod + " 鍙?Leaf",
      start,
      end,
      second,
      actualServers,
      serverNodes: (() => {
        const srvY = POD_BAND_Y + POD_SRV_Y_FIRST;
        const srvW = 74;
        const srvGap = Math.max(0, (POD_W - 2 * POD_INNER_LEFT - 3 * srvW) / 2);
        return [
          { x: curPodX + POD_INNER_LEFT, y: srvY, label: actualServers > 0 ? String(start) : "-" },
          { x: curPodX + POD_INNER_LEFT + srvW + srvGap, y: srvY, label: actualServers > 1 ? String(second) : "-" },
          { x: curPodX + POD_INNER_LEFT + 2 * (srvW + srvGap), y: srvY, label: actualServers > 0 ? String(end) : "-" }
        ];
      })()
    });
    curPodX += POD_W + POD_GAP;
  }

  // ===== Spine Band (top) =====
  const spineBoxW = canvasW - SPINE_BOX_X * 2;
  const spineBox = {
    x: SPINE_BOX_X,
    y: SPINE_BOX_Y,
    w: spineBoxW,
    h: SPINE_BOX_H,
    label:
      "鏍稿績灞?(Spine) - " +
      (virtualDualPlane ? "铏氭嫙鍙屽钩闈?[VRF 閫冪敓]" : "鐗╃悊鍙屽钩闈?[P1/P2 鐙珛璁惧]") +
      " [" + spine + " 鍙癩",
    sub: "Spine 涓?Leaf 闂?8x400G 浜掕仈锛屾瘡鍙?Leaf 涓婅仈 32x400G"
  };

  const spinePositions = buildSpinePositions(spine);
  const spinePairCount = spinePositions.length;
  const spineUnitW = (spineBoxW - 80) / Math.max(spinePairCount, 1);
  const spineStartX = SPINE_BOX_X + 40;
  const spineNodes: SpineNodeLayout[] = [];
  let curX = spineStartX;
  for (let i = 0; i < spinePositions.length; i++) {
    const sp = spinePositions[i];
    const cx = curX + spineUnitW / 2;
    if (sp.type === "gap") {
      spineNodes.push({ x: cx, y: SPINE_Y, label: "鐪佺暐 " + sp.count + " 鍙", kind: "ellipsis", count: sp.count });
    } else {
      spineNodes.push({ x: cx - 50, y: SPINE_Y, label: "Spine " + sp.idx, kind: "real" });
    }
    curX += spineUnitW;
  }

  // ===== Leaf Band (middle) =====
  const leafBoxW = canvasW - LEAF_BOX_X * 2;
  const leafBox = {
    x: LEAF_BOX_X,
    y: LEAF_BOX_Y,
    w: leafBoxW,
    h: LEAF_BOX_H,
    label: "鎺ュ叆灞?(Leaf) - 姣?POD " + leavesPerPod + " 鍙?(L1/L2 鍚?" + leavesPerPlane + " 鍙?",
    sub: "鍏?" + leaf + " 鍙?路 姣忓彴 B300 涓婅仈 16 涓?400G 路 8 鍒?L1銆? 鍒?L2"
  };
  const leafNodes: LeafNodeLayout[] = [];
  // For each visible POD, lay out 3 leaf pairs (first 2 + last of each plane)
  const visibleLeafIndices = leavesPerPlane <= 2
    ? Array.from({ length: leavesPerPlane }, (_, i) => i + 1)
    : [1, 2, leavesPerPlane];
  for (let pi = 0; pi < podLayouts.length; pi++) {
    const pod = podLayouts[pi];
    if (pod.kind === "gap") {
      leafNodes.push({
        x: pod.x + pod.w / 2 - LEAF_BLOCK_W - LEAF_BLOCK_GAP / 2,
        y: LEAF_BAND_INNER_Y,
        podIdx: pi,
        leafLabel: 0,
        isFirst: false,
        isLast: false,
        isGap: true
      });
      continue;
    }
    const podNum = parseInt(pod.label.replace("POD ", "")) - 1;
    // 3 pair positions across POD width
    const pairRatios = [0.2, 0.5, 0.8];
    for (let li = 0; li < visibleLeafIndices.length; li++) {
      const cx = pod.x + pod.w * pairRatios[Math.min(li, pairRatios.length - 1)];
      const leafNum = visibleLeafIndices[li];
      // L1 (P1 plane) at left of pair
      leafNodes.push({
        x: cx - LEAF_BLOCK_W - LEAF_BLOCK_GAP / 2,
        y: LEAF_BAND_INNER_Y,
        podIdx: pi,
        leafLabel: leafNum,
        isFirst: li === 0,
        isLast: li === visibleLeafIndices.length - 1,
        isGap: false
      });
      // L2 (P2 plane) at right of pair
      leafNodes.push({
        x: cx + LEAF_BLOCK_GAP / 2,
        y: LEAF_BAND_INNER_Y,
        podIdx: pi,
        leafLabel: leafNum,
        isFirst: li === 0,
        isLast: li === visibleLeafIndices.length - 1,
        isGap: false
      });
    }
  }

  // ===== Lines: Spine <-> Leaf full mesh =====
  const spineLeafLinks: ComputeLayout["spineLeafLinks"] = [];
  for (const sp of spineNodes) {
    if (sp.kind !== "real") continue;
    for (const ln of leafNodes) {
      if (ln.isGap) continue;
      const x1 = sp.x + 50;          // right edge of SpinePair (P2 right)
      const y1 = sp.y + 34;          // bottom of spine pair
      const x2 = ln.x + LEAF_BLOCK_W / 2;
      const y2 = ln.y;               // top of leaf block
      const offset = Math.abs(y2 - y1) * 0.5;
      spineLeafLinks.push({
        d: "M " + x1 + " " + y1 + " C " + x1 + " " + (y1 + offset) + ", " + x2 + " " + (y2 - offset) + ", " + x2 + " " + y2,
        color: LINK_COLOR
      });
    }
  }

  // ===== Lines: Leaf <-> Server fanout per POD =====
  const leafServerLinks: ComputeLayout["leafServerLinks"] = [];
  // NIC-to-leaf pair mapping: NIC0鈫扡1-1/L2-1, NIC1鈫扡1-2/L2-2, NIC7鈫扡1-8/L2-8
  const nicIdxToLabel = (nicIdx: number) => {
    if (nicIdx === 0) return visibleLeafIndices[0];
    if (nicIdx === 1) return visibleLeafIndices.length > 1 ? visibleLeafIndices[1] : visibleLeafIndices[0];
    if (nicIdx === 7) return visibleLeafIndices[visibleLeafIndices.length - 1];
    return 0; // skip other NICs
  };
  for (const pod of podLayouts) {
    if (pod.kind !== "pod") continue;
    const pi = podLayouts.indexOf(pod);
    for (const sn of pod.serverNodes) {
      if (sn.label === "-") continue;
      for (const nicIdx of [0, 1, 7]) {
        const targetLabel = nicIdxToLabel(nicIdx);
        if (targetLabel === 0) continue;
        // Find leaf nodes in this POD with matching leafLabel
        const matchingLeaves = leafNodes.filter(
          ln => !ln.isGap && ln.podIdx === pi && ln.leafLabel === targetLabel
        );
        for (const ln of matchingLeaves) {
          // Line from NIC top to leaf block bottom
          const x1 = sn.x + nicIdx * 8 + 3.5; // NIC center-x
          const y1 = sn.y;                      // NIC top
          const x2 = ln.x + LEAF_BLOCK_W / 2;
          const y2 = ln.y + LEAF_BLOCK_H + 4;   // leaf bottom
          const offset = Math.abs(y2 - y1) * 0.4;
          leafServerLinks.push({
            d: "M " + x1 + " " + y1 + " C " + x1 + " " + (y1 + offset) + ", " + x2 + " " + (y2 - offset) + ", " + x2 + " " + y2,
            color: LINK_COLOR
          });
        }
      }
    }
  }

  // ===== VRF escape link (only virtual dual plane) =====
  const realSpines = spineNodes.filter(s => s.kind === "real");
  let escapeLink: ComputeLayout["escapeLink"] = null;
  if (virtualDualPlane && realSpines.length >= 2) {
    const first = realSpines[0];
    const last = realSpines[realSpines.length - 1];
    const x1 = first.x + 50;
    const y1 = SPINE_Y - 12;
    const x2 = last.x;
    const y2 = SPINE_Y - 12;
    const arcOffset = 40;
    escapeLink = {
      d: "M " + x1 + " " + y1 + " C " + x1 + " " + (y1 - arcOffset) + ", " + x2 + " " + (y2 - arcOffset) + ", " + x2 + " " + y2,
      label: "VRF 閫冪敓閾捐矾锛歅1/P2 鍏变韩鏍稿績锛岄€昏緫闅旂"
    };
  }

  return { canvasW, canvasH, spineBox, leafBox, spineNodes, leafNodes, pods: podLayouts, spineLeafLinks, leafServerLinks, escapeLink };
}

function ComputeTopology({ topology, zoom }: { topology: Topology; zoom: number }) {
  const b300 = numberMetric(topology, "b300");
  const pods = numberMetric(topology, "pods");
  const leaf = numberMetric(topology, "leaf");
  const spine = numberMetric(topology, "spine");
  const supported = boolMetric(topology, "supported");
  const virtualDualPlane = boolMetric(topology, "virtualDualPlane");

  if (!supported) {
    return (
      <div className="topology-scroll">
        <svg viewBox="0 0 800 360" role="img" aria-label={topology.title} className="topology-svg detailed-topology">
          <rect x="40" y="40" width="720" height="280" rx="18" className="zone-warning" />
          <text x="400" y="160" textAnchor="middle" className="topology-title-large">B300 鏁伴噺瓒呰繃 224 鍙</text>
          <text x="400" y="208" textAnchor="middle" className="topology-note">绗竴闃舵涓嶇敓鎴愪簩灞傝绠楃綉鎷撴墤锛屼笁灞傜粍缃戝悗缁敮鎸併€</text>
          <text x="400" y="248" textAnchor="middle" className="topology-info">褰撳墠 B300 = {b300} 鍙</text>
        </svg>
      </div>
    );
  }

  const layout = calcComputeLayout({ b300, pods, leaf, spine, virtualDualPlane });
  const { canvasW, canvasH, spineBox, leafBox, spineNodes, leafNodes, pods: podLayouts, spineLeafLinks, leafServerLinks, escapeLink } = layout;

  return (
    <div className="topology-scroll">
      <svg viewBox={"0 0 " + canvasW + " " + canvasH} role="img" aria-label={topology.title} className="topology-svg detailed-topology">
        {/* Spine Band (top) */}
        {/* Spine band colored header bar */}
        <rect x={spineBox.x} y={spineBox.y} width={spineBox.w} height="62" fill="#4d7f2c" rx="12" />
        <rect x={spineBox.x+12} y={spineBox.y+62} width={spineBox.w-24} height="1" fill="#3d6f1c" />
        {/* Spine zone left accent bar */}
        <line x1={spineBox.x+8} y1={spineBox.y+20} x2={spineBox.x+8} y2={spineBox.y+spineBox.h-20} className="zone-accent accent-spine" />
        <rect x={spineBox.x} y={spineBox.y} width={spineBox.w} height={spineBox.h} rx="12" className="zone zone-compute" />
        <text x={spineBox.x + 28} y={spineBox.y + 26} className="zone-heading-white">{spineBox.label}</text>
        <text x={spineBox.x + 28} y={spineBox.y + 48} className="zone-sub-white">{spineBox.sub}</text>

        {escapeLink && (
          <g>
            <path d={escapeLink.d} fill="none" stroke={ESCAPE_COLOR} strokeWidth="2" strokeDasharray="6 4" />
            <rect x={(spineBox.x + spineBox.x + spineBox.w) / 2 - 220} y={SPINE_BOX_Y + 60} width="440" height="22" rx="6" fill="#ffffff" stroke={ESCAPE_COLOR} strokeWidth="1" />
            <text x={(spineBox.x + spineBox.x + spineBox.w) / 2} y={SPINE_BOX_Y + 75} textAnchor="middle" className="device-sublabel" fill={ESCAPE_COLOR}>
              {escapeLink.label}
            </text>
          </g>
        )}

        {spineNodes.map((sp, i) => {
          if (sp.kind === "ellipsis") {
            return (
              <g key={"sp-" + i}>
                <text x={sp.x} y={sp.y + 22} textAnchor="middle" className="ellipsis-text">...</text>
                <text x={sp.x} y={sp.y + 44} textAnchor="middle" className="device-sublabel">{sp.label}</text>
              </g>
            );
          }
          return <SpinePair key={"sp-" + i} x={sp.x} y={sp.y} label={sp.label} />;
        })}

        {/* Spine -> Leaf full mesh lines */}
        {spineLeafLinks.map((link, i) => (
          <path key={"sl-" + i} d={link.d} fill="none" stroke={link.color} strokeWidth="1" opacity="0.45" />
        ))}

        {/* Leaf Band (middle, full width) */}

        {leafNodes.map((ln, i) => {
          if (ln.isGap) {
            return (
              <g key={"ln-" + i}>
                <text x={ln.x + LEAF_BLOCK_W + LEAF_BLOCK_GAP / 2} y={ln.y + 22} textAnchor="middle" className="ellipsis-text">...</text>
                <text x={ln.x + LEAF_BLOCK_W + LEAF_BLOCK_GAP / 2} y={ln.y + 44} textAnchor="middle" className="device-sublabel">鐪佺暐璇?POD 鐨?Leaf</text>
              </g>
            );
          }
          const pairIdx = Math.floor(i / 2);
          const isL1 = (i - pairIdx * 2) === 0;
          const planeNum = isL1 ? 1 : 2;
          const planeLabel = isL1 ? "L1" : "L2";
          return <LeafBlock key={"ln-" + i} x={ln.x} y={ln.y} plane={planeNum} label={planeLabel + "-" + ln.leafLabel} />;
        })}

        {/* Leaf -> Server fanout lines */}
        {leafServerLinks.map((link, i) => (
          <path key={"ls-" + i} d={link.d} fill="none" stroke={link.color} strokeWidth="1" opacity="0.45" />
        ))}

        {/* POD Band (bottom, servers only) */}
        {/* POD zone left accent bar */}
        <line x1={48} y1={POD_BAND_Y+20} x2={48} y2={canvasH-70} className="zone-accent accent-pod" />
        {podLayouts.map((pod, i) => {
          if (pod.kind === "gap") {
            return (
              <g key={"gap-" + i}>
                <rect x={pod.x} y={pod.y} width={pod.w} height={pod.h} rx="10" fill="rgba(245,247,250,0.3)" stroke="#9aa3b1" strokeWidth="1" strokeDasharray="6 6" />
                <line x1={pod.x + 20} y1={pod.y + pod.h / 2 - 20} x2={pod.x + pod.w - 20} y2={pod.y + pod.h / 2 - 20} stroke="#9aa3b1" strokeWidth="1" strokeDasharray="3 3" />
                <line x1={pod.x + 20} y1={pod.y + pod.h / 2 + 20} x2={pod.x + pod.w - 20} y2={pod.y + pod.h / 2 + 20} stroke="#9aa3b1" strokeWidth="1" strokeDasharray="3 3" />
                <text x={pod.x + pod.w / 2} y={pod.y + pod.h / 2 + 6} textAnchor="middle" className="ellipsis-text">...</text>
                <text x={pod.x + pod.w / 2} y={pod.y + pod.h / 2 + 28} textAnchor="middle" className="device-sublabel">{pod.subLabel}</text>
              </g>
            );
          }
          return (
            <g key={"pod-" + i} className="pod-group">
              <rect x={pod.x} y={pod.y} width={pod.w} height={pod.h} rx="10" className="pod-frame" />
              <rect x={pod.x + 12} y={pod.y + 10} width={pod.w - 24} height="22" rx="4" fill="#ffffff" />
              <text x={pod.x + 20} y={pod.y + 26} className="pod-label">{pod.label}</text>
              <text x={pod.x + pod.w - 20} y={pod.y + 26} textAnchor="end" className="device-sublabel">{pod.subLabel}</text>

              {pod.serverNodes.map((server, si) => (
                <ServerNodeWithNics key={"srv-" + i + "-" + si} x={server.x} y={server.y} label={server.label} />
              ))}

              <text x={pod.x + 20} y={pod.y + pod.h - 36} className="device-sublabel">{pod.note}</text>
              <text x={pod.x + 20} y={pod.y + pod.h - 18} className="device-sublabel">{pod.note2}</text>
            </g>
          );
        })}

        {/* Bottom legend */}
        <rect x={40} y={canvasH - 48} width={canvasW - 80} height="36" rx="6" fill="#f0f2f5" stroke="#b0b8c4" strokeWidth="1.5" />
        <text x={48} y={canvasH - 18} className="device-sublabel" fontWeight="600" fill="#444">鍥句緥</text>
        <line x1={50} y1={canvasH - 33} x2={80} y2={canvasH - 33} stroke={LINK_COLOR} strokeWidth="2" />
        <text x={88} y={canvasH - 29} className="device-sublabel">钃濊壊瀹炵嚎锛歋pine 鈫?Leaf銆丩eaf 鈫?Server 浠ｈ〃鎬ц繛鎺</text>
        {virtualDualPlane && (
          <>
            <line x1={460} y1={canvasH - 33} x2={490} y2={canvasH - 33} stroke={ESCAPE_COLOR} strokeWidth="2" strokeDasharray="6 4" />
            <text x={498} y={canvasH - 29} className="device-sublabel">绱壊铏氱嚎锛歏RF 閫冪敓閾捐矾</text>
          </>
        )}
        <text x={canvasW - 40} y={canvasH - 29} textAnchor="end" className="device-sublabel">
          B300 = {b300} 鍙?路 POD = {pods} 涓?{virtualDualPlane ? "(铏氭嫙鍙屽钩闈笅 POD 琛ㄧず鎶借薄鍒嗙粍)" : "(鐗╃悊鍙屽钩闈紝鎸夋瘡 32 鍙版湇鍔″櫒涓€缁勮〃鎷撴墤)"} 路 Leaf = {leaf} 鍙?路 Spine = {spine} 鍙?
        </text>
      </svg>
    </div>
  );
function SpinePair({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <g>
      {/* P1 block */}
      <rect x={x} y={y} width="44" height="36" className="plane-p1" />
      <rect x={x} y={y} width="44" height="7" className="device-faceplate" />
      {/* P1 port dots */}
      {[0,1,2,3,4,5].map(j => <rect key={"p1p"+j} x={x+4+j*6} y={y+27} width="3" height="3" className="port-dot" />)}
      <text x={x + 22} y={y + 19} textAnchor="middle" className="plane-text">P1</text>
      {/* P2 block */}
      <rect x={x + 48} y={y} width="44" height="36" className="plane-p2" />
      <rect x={x + 48} y={y} width="44" height="7" className="device-faceplate" />
      {/* P2 port dots */}
      {[0,1,2,3,4,5].map(j => <rect key={"p2p"+j} x={x+52+j*6} y={y+27} width="3" height="3" className="port-dot" />)}
      <text x={x + 70} y={y + 19} textAnchor="middle" className="plane-text">P2</text>
      {/* dashed frame */}
      <rect x={x - 6} y={y - 8} width="104" height="56" className="plane-dashed" />
      {label && <text x={x + 46} y={y + 56} textAnchor="middle" className="device-sublabel">{label}</text>}
    </g>
  );
}

}

function LeafBlock({ x, y, plane, label }: { x: number; y: number; plane: number; label: string }) {
  const cls = plane === 1 ? "leaf-p1" : "leaf-p2";
  return (
    <g>
      <rect x={x} y={y} width={LEAF_BLOCK_W} height={LEAF_BLOCK_H + 4} className={cls} />
      <rect x={x} y={y} width={LEAF_BLOCK_W} height="5" className="device-faceplate" />
      {/* port dots */}
      {[0,1,2,3,4].map(j => <rect key={"lp"+j} x={x+5+j*7} y={y+LEAF_BLOCK_H-2} width="2.5" height="2.5" className="port-dot" />)}
      <text x={x + LEAF_BLOCK_W / 2} y={y + LEAF_BLOCK_H / 2 + 1} textAnchor="middle" className="leaf-text">{label}</text>
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
          <text x={x + index * 8 + 3.5} y={y + 18} textAnchor="middle" className="nic-text">{index + 1}</text>
        </g>
      ))}
      <rect x={x - 4} y={y + 28} width="74" height="20" className="server-base" />
      <text x={x + 33} y={y + 42} textAnchor="middle" className="server-label">{label}</text>
    </g>
  );
}

function StorageServerNode({ x, y, label, portsPerServer }: { x: number; y: number; label: string; portsPerServer: number }) {
  const portColors = ["#06b6d4", "#0891b2", "#0d9488", "#14b8a6"];
  const ports = storagePortIndexes(portsPerServer);
  const portW = 14;
  const gap = 3;
  const nodeW = Math.max(64, ports.length * portW + Math.max(0, ports.length - 1) * gap + 12);

  return (
    <g>
      {ports.map((port, index) => (
        <g key={port}>
          <rect x={x + 6 + index * (portW + gap)} y={y} width={portW} height="28" rx="1.5" fill={portColors[index]} />
          <text x={x + 6 + index * (portW + gap) + portW / 2} y={y + 18} textAnchor="middle" className="nic-text">
            {port}
          </text>
        </g>
      ))}
      <rect x={x} y={y + 28} width={nodeW} height="20" className="server-base" />
      <text x={x + nodeW / 2} y={y + 42} textAnchor="middle" className="server-label">
        {label}
      </text>
    </g>
  );
}
// ============== Shared Helpers ==============
function SwitchIcon({ x, y, tone = "blue", size = 48, label, detail }: { x: number; y: number; tone?: "blue" | "cyan" | "silver" | "graphite"; size?: number; label?: string; detail?: string }) {
  const fill = tone === "cyan" ? "#e6f7fc" : tone === "silver" ? "#f1f3f6" : tone === "graphite" ? "#2b2f36" : "#eaf2ff";
  const stroke = tone === "cyan" ? "#00a7e1" : tone === "silver" ? "#7a8190" : tone === "graphite" ? "#1a1d22" : "#2f6fed";
  const textColor = tone === "graphite" ? "#ffffff" : "#1a1d22";
  const subColor = tone === "graphite" ? "#c7cdd6" : "#5d6470";
  const half = size / 2;
  const inner = size - 18;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx="9" fill={fill} stroke={stroke} strokeWidth="1.6" />
      <rect x={x + 9} y={y + 9} width={inner} height={inner - 16} rx="4" fill={fill} stroke={stroke} strokeWidth="1" />
      <line x1={x + 9} y1={y + (size - 9) / 2} x2={x + 9 + inner} y2={y + (size - 9) / 2} stroke={stroke} strokeWidth="1" />
      <line x1={x + half} y1={y + 9} x2={x + half} y2={y + size - 9} stroke={stroke} strokeWidth="1" />
      <circle cx={x + 9} cy={y + 9} r="1.6" fill={stroke === "#1a1d22" ? "#f04d4d" : stroke} />
      {label && <text x={x + half} y={y + size + 12} textAnchor="middle" className="node-label" fill={textColor}>{label}</text>}
      {detail && <text x={x + half} y={y + size + 24} textAnchor="middle" className="node-detail" fill={subColor}>{detail}</text>}
    </g>
  );
}

function CloudIcon({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g className="overview-cloud">
      <circle cx={x + 26} cy={y + 28} r="18" />
      <circle cx={x + 48} cy={y + 20} r="16" />
      <circle cx={x + 70} cy={y + 28} r="18" />
      <circle cx={x + 88} cy={y + 20} r="14" />
      <rect x={x + 18} y={y + 28} width="76" height="22" rx="11" />
      <text x={x + 56} y={y + 34} textAnchor="middle" className="overview-cloud-label">
        {label}
      </text>
    </g>
  );
}

function HexIcon({
  x,
  y,
  label,
  tone = "blue"
}: {
  x: number;
  y: number;
  label: string;
  tone?: "blue" | "cyan" | "silver";
}) {
  const fill = tone === "cyan" ? "#6f95bf" : tone === "silver" ? "#8ba0b9" : "#6c93bb";
  const stroke = tone === "cyan" ? "#52759f" : tone === "silver" ? "#6c829c" : "#52759f";
  const points = `${x + 14},${y} ${x + 42},${y} ${x + 56},${y + 24} ${x + 42},${y + 48} ${x + 14},${y + 48} ${x},${y + 24}`;
  return (
    <g>
      <polygon points={points} fill={fill} stroke={stroke} strokeWidth="1.4" />
      <text x={x + 28} y={y + 29} textAnchor="middle" className="overview-hex-label">
        {label}
      </text>
    </g>
  );
}

function ServerGroup({ x, y, title, detail, serverCount, portsPerServer, width = 156, small = false }: { x: number; y: number; title: string; detail: string; serverCount: number; portsPerServer: number; width?: number; small?: boolean }) {
  const h = small ? 44 : 72;
  const iconH = small ? 18 : 28;
  return (
    <g>
      <rect x={x} y={y} width={width} height={h} rx="8" className="server-group" />
      <text x={x + 10} y={y + 16} className="server-group-title">{title}</text>
      <text x={x + width - 10} y={y + 16} textAnchor="end" className="server-group-detail">{detail}</text>
      {!small && <rect x={x + 10} y={y + 22} width={width - 20} height={iconH} rx="4" className="server-icon" />}
      <text x={x + 10} y={y + h - 8} className="server-group-detail">{serverCount} 台 x {portsPerServer} 端口 = {serverCount * portsPerServer} 个</text>
    </g>
  );
}

function NetworkLines({ color, points, dashed = false }: { color: string; points: Array<[number, number, number, number]>; dashed?: boolean }) {
  return (
    <g>
      {points.map((p, i) => (
        <line key={i} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} stroke={color} strokeWidth="1.8" strokeDasharray={dashed ? "4 3" : undefined} />
      ))}
    </g>
  );
}

function NetworkPaths({ color, paths, dashed = false }: { color: string; paths: Array<Array<[number, number]>>; dashed?: boolean }) {
  return (
    <g>
      {paths.map((path, i) => (
        <polyline
          key={i}
          points={path.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      ))}
    </g>
  );
}

function Legend({
  items,
  x = 20,
  y = 20,
  width = 280,
  title = "图例"
}: {
  items: Array<{ color: string; label: string; dashed?: boolean }>;
  x?: number;
  y?: number;
  width?: number;
  title?: string;
}) {
  const rowH = 38;
  const height = 58 + items.length * rowH;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="0" className="legend-box" />
      <text x={x + width / 2} y={y + 28} textAnchor="middle" className="legend-title">
        {title}
      </text>
      {items.map((it, i) => (
        <g key={i}>
          <line
            x1={x + 18}
            y1={y + 46 + i * rowH}
            x2={x + 98}
            y2={y + 46 + i * rowH}
            stroke={it.color}
            strokeWidth="4"
            strokeDasharray={it.dashed ? "8 5" : undefined}
          />
          <text x={x + 110} y={y + 51 + i * rowH} className="legend-text">
            {it.label}
          </text>
        </g>
      ))}
    </g>
  );
}
// ============== Storage Topology ==============
function StorageTopology({ topology }: { topology: Topology }) {
  const b300 = numberMetric(topology, "b300");
  const allFlash = numberMetric(topology, "allFlash");
  const ports400 = numberMetric(topology, "ports400");
  const leaf = numberMetric(topology, "leaf");
  const spine = numberMetric(topology, "spine");
  const supported = boolMetric(topology, "supported");
  const directLeafPair = boolMetric(topology, "directLeafPair");
  const gpuPorts400 = numberMetric(topology, "gpuPorts400");
  const allFlashPorts400 = numberMetric(topology, "allFlashPorts400");
  const gpuPerServer = b300 > 0 ? Math.round(gpuPorts400 / b300) : 0;
  const flashPerServer = allFlash > 0 ? Math.round(allFlashPorts400 / allFlash) : 0;

  if (!supported) {
    return (
      <div className="topology-scroll">
        <svg viewBox="0 0 800 320" role="img" aria-label={topology.title} className="topology-svg detailed-topology">
          <rect x="40" y="40" width="720" height="240" rx="18" className="zone-warning" />
          <text x="400" y="150" textAnchor="middle" className="topology-title-large">Storage Not Configured</text>
          <text x="400" y="190" textAnchor="middle" className="topology-note">GPU and Flash server 400G storage NICs are both 0; topology not generated.</text>
        </svg>
      </div>
    );
  }

  const STORAGE_SW_W = 74;
  const STORAGE_SW_H = 34;
  const STORAGE_SW_GAP = 132;
  const SPINE_BAND_Y = 30;
  const SPINE_BAND_H = 120;
  const LEAF_BAND_Y = 170;
  const LEAF_BAND_H = 150;
  const SERVER_BAND_Y = 340;
  const SERVER_BAND_H = 310;
  const canvasW = 1100;
  const canvasH = 660;

  const visibleSpineCount = Math.min(spine, 4);
  const visibleLeafCount = Math.min(leaf, 4);

  const spineXs = directLeafPair
    ? []
    : spine <= 3
    ? centeredStartPositions(spine, STORAGE_SW_W, STORAGE_SW_GAP, canvasW)
    : [220, 220 + STORAGE_SW_GAP, 520, canvasW - 230];
  const leafXs = directLeafPair
    ? centeredStartPositions(2, STORAGE_SW_W, 260, canvasW)
    : leaf <= 3
    ? centeredStartPositions(leaf, STORAGE_SW_W, STORAGE_SW_GAP, canvasW)
    : [220, 220 + STORAGE_SW_GAP, 520, canvasW - 230];

  function bezierLink(x1: number, y1: number, x2: number, y2: number): string {
    const dy = Math.abs(y2 - y1) * 0.4;
    return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
  }

  const spineLabels = spine <= 4
    ? Array.from({ length: spine }, (_, i) => `Spine${i + 1}`)
    : ["Spine1", "Spine2", "...", `Spine${spine}`];
  const leafLabels = leaf <= 4
    ? Array.from({ length: leaf }, (_, i) => `Leaf${i + 1}`)
    : ["Leaf1", "Leaf2", "...", `Leaf${leaf}`];

  function renderStorageSwitch(x: number, y: number, label: string, tone: "core" | "access") {
    const cls = tone === "core" ? "storage-switch-core" : "storage-switch-access";
    return (
      <g key={label}>
        <rect x={x} y={y} width={STORAGE_SW_W} height={STORAGE_SW_H} className={cls} />
        <rect x={x} y={y} width={STORAGE_SW_W} height="6" className="device-faceplate" />
        {[0, 1, 2, 3, 4, 5].map((j) => (
          <rect key={`pt${j}`} x={x + 7 + j * 10} y={y + STORAGE_SW_H - 6} width="3" height="3" className="port-dot" />
        ))}
        <text x={x + STORAGE_SW_W / 2} y={y + 20} textAnchor="middle" className="leaf-text compute-leaf-text">{label}</text>
      </g>
    );
  }

  const spineNodeYs: number[] = spineXs.map(() => SPINE_BAND_Y + 52);
  const leafNodeYs: number[] = leafXs.map(() => LEAF_BAND_Y + 55);

  const visibleGpuLabels = visibleStorageServerLabels("GPU", b300);
  const visibleFlashLabels = visibleStorageServerLabels("Flash", allFlash);
  const gpuServerXs = visibleGpuLabels.map((_, index) => 92 + index * 104);
  const flashServerXs = visibleFlashLabels.map((_, index) => canvasW / 2 + 52 + index * 104);

  const spineLeafLinks = directLeafPair
    ? []
    : leafXs.flatMap((lx, li) => {
        const targetSpines = storageLeafSpineTargetIndexes(li, spineXs.length).map((index) => spineXs[index]);
        return targetSpines.map((sx) => ({
          d: bezierLink(sx + STORAGE_SW_W / 2, SPINE_BAND_Y + 52 + STORAGE_SW_H, lx + STORAGE_SW_W / 2, LEAF_BAND_Y + 55)
        }));
      });
  const directLeafInterconnectLinks = directLeafPair && leafXs.length >= 2
    ? [0, 1, 2].map((index) => ({
        x1: leafXs[0] + STORAGE_SW_W,
        x2: leafXs[1],
        y: LEAF_BAND_Y + 72 + index * 10
      }))
    : [];

  const serverLeafLinks: Array<{ d: string; color: string }> = [
    ...gpuServerXs.slice(0, 3).flatMap((serverX, serverIndex) =>
      storageServerLeafTargetIndexes(serverIndex, gpuPerServer, leafXs.length).map((leafIndex, portIndex) => ({
        d: bezierLink(
          leafXs[leafIndex] + STORAGE_SW_W / 2,
          leafNodeYs[leafIndex] + STORAGE_SW_H,
          serverX + 6 + portIndex * 17 + 7,
          SERVER_BAND_Y + 72
        ),
        color: "#0891b2"
      }))
    ),
    ...flashServerXs.slice(0, 3).flatMap((serverX, serverIndex) =>
      storageServerLeafTargetIndexes(serverIndex, flashPerServer, leafXs.length,).map((leafIndex, portIndex) => ({
        d: bezierLink(
          leafXs[(leafXs.length - 1 - leafIndex + leafXs.length) % leafXs.length] + STORAGE_SW_W / 2,
          leafNodeYs[(leafXs.length - 1 - leafIndex + leafXs.length) % leafXs.length] + STORAGE_SW_H,
          serverX + 6 + portIndex * 17 + 7,
          SERVER_BAND_Y + 72
        ),
        color: "#0d9488"
      }))
    )
  ];

  return (
    <div className="topology-scroll">
        <svg viewBox={`0 0 ${canvasW} ${canvasH}`} role="img" aria-label={topology.title} className="topology-svg detailed-topology">
        {!directLeafPair && (
          <>
            <rect x="20" y={SPINE_BAND_Y} width={canvasW - 40} height={SPINE_BAND_H} rx="10" className="storage-lane-frame" />
            <line x1="34" y1={SPINE_BAND_Y + 24} x2="34" y2={SPINE_BAND_Y + SPINE_BAND_H - 24} className="storage-lane-accent" />
            <text x="48" y={SPINE_BAND_Y + 28} className="storage-lane-title">Spine (Storage Core)</text>
            <text x={canvasW - 96} y={SPINE_BAND_Y + 28} textAnchor="end" className="storage-lane-meta">{spine} x 32x400G Spine</text>

            {spineXs.map((sx, si) => {
              if (spine > 4 && si === 2) {
                return (
                  <g key={`sp-gap`}>
                    <text x={sx + STORAGE_SW_W / 2} y={spineNodeYs[si] + STORAGE_SW_H / 2 + 6} textAnchor="middle" className="ellipsis-text">...</text>
                    <text x={sx + STORAGE_SW_W / 2} y={spineNodeYs[si] + STORAGE_SW_H / 2 + 28} textAnchor="middle" className="device-sublabel">{spine - visibleSpineCount + 1} more</text>
                  </g>
                );
              }
              return renderStorageSwitch(sx, spineNodeYs[si], spineLabels[si], "core");
            })}
          </>
        )}

        {/* Leaf Band */}
        <rect x="20" y={LEAF_BAND_Y} width={canvasW - 40} height={LEAF_BAND_H} rx="10" className="storage-lane-frame" />
        <line x1="34" y1={LEAF_BAND_Y + 24} x2="34" y2={LEAF_BAND_Y + LEAF_BAND_H - 24} className="storage-lane-accent" />
        <text x="48" y={LEAF_BAND_Y + 28} className="storage-lane-title">Leaf (400G Server Access)</text>
        <text x={canvasW - 96} y={LEAF_BAND_Y + 28} textAnchor="end" className="storage-lane-meta">{leaf} x Leaf, 32x400G access ports each</text>

        {leafXs.map((lx, li) => {
          if (leaf > 4 && li === 2) {
            return (
              <g key={`leaf-gap`}>
                <text x={lx + STORAGE_SW_W / 2} y={leafNodeYs[li] + STORAGE_SW_H / 2 + 6} textAnchor="middle" className="ellipsis-text">...</text>
                <text x={lx + STORAGE_SW_W / 2} y={leafNodeYs[li] + STORAGE_SW_H / 2 + 28} textAnchor="middle" className="device-sublabel">{leaf - visibleLeafCount + 1} more</text>
              </g>
            );
          }
          return renderStorageSwitch(lx, leafNodeYs[li], leafLabels[li], "access");
        })}

        {/* Spine -> Leaf Links */}
        {spineLeafLinks.map((link, i) => (
          <path key={`sl-${i}`} d={link.d} fill="none" stroke="#06b6d4" strokeWidth="1.2" opacity="0.35" />
        ))}
        {directLeafInterconnectLinks.map((link, i) => (
          <line key={`ll-${i}`} x1={link.x1} y1={link.y} x2={link.x2} y2={link.y} stroke="#06b6d4" strokeWidth="2" opacity="0.65" />
        ))}

        {/* Leaf -> Server Links */}
        {serverLeafLinks.map((link, i) => (
          <path key={`ls-${i}`} d={link.d} fill="none" stroke={link.color} strokeWidth="1.2" opacity="0.35" />
        ))}

        {/* GPU Server Zone */}
        <rect x="20" y={SERVER_BAND_Y} width={canvasW / 2 - 25} height={SERVER_BAND_H} rx="10" className="storage-server-frame" />
        <line x1="34" y1={SERVER_BAND_Y + 24} x2="34" y2={SERVER_BAND_Y + SERVER_BAND_H - 48} className="storage-lane-accent" />
        <text x="48" y={SERVER_BAND_Y + 28} className="storage-lane-title">GPU Server Access</text>
        <text x={canvasW / 2 - 88} y={SERVER_BAND_Y + 28} textAnchor="end" className="storage-lane-meta">{b300} x {gpuPerServer} = {gpuPorts400} x 400G ports</text>

        {visibleGpuLabels.map((label, index) => (
          <StorageServerNode key={label} x={gpuServerXs[index]} y={SERVER_BAND_Y + 72} label={label} portsPerServer={gpuPerServer} />
        ))}
        <text x="52" y={SERVER_BAND_Y + 160} className="server-group-detail">GPU servers act as storage access endpoints.</text>

        {/* Flash Server Zone */}
        <rect x={canvasW / 2 + 5} y={SERVER_BAND_Y} width={canvasW / 2 - 25} height={SERVER_BAND_H} rx="10" className="storage-server-frame" />
        <line x1={canvasW / 2 + 19} y1={SERVER_BAND_Y + 24} x2={canvasW / 2 + 19} y2={SERVER_BAND_Y + SERVER_BAND_H - 48} className="storage-lane-accent" />
        <text x={canvasW / 2 + 33} y={SERVER_BAND_Y + 28} className="storage-lane-title">Flash Storage Server Access</text>
        <text x={canvasW - 96} y={SERVER_BAND_Y + 28} textAnchor="end" className="storage-lane-meta">{allFlash} x {flashPerServer} = {allFlashPorts400} x 400G ports</text>

        {visibleFlashLabels.map((label, index) => (
          <StorageServerNode key={label} x={flashServerXs[index]} y={SERVER_BAND_Y + 72} label={label} portsPerServer={flashPerServer} />
        ))}
        <text x={canvasW / 2 + 37} y={SERVER_BAND_Y + 160} className="server-group-detail">
          {directLeafPair ? `Ports=${ports400}; Leaf=${leaf}; Direct Leaf Interconnect` : `Ports=${ports400}; Leaf=${leaf}; Spine=${spine}`}
        </text>

        {/* Bottom Legend */}
        <rect x="20" y={canvasH - 48} width={canvasW - 40} height="38" rx="6" fill="#f0f2f5" stroke="#b0b8c4" strokeWidth="1.5" />
        <text x="32" y={canvasH - 20} className="device-sublabel" fontWeight="600" fill="#444">Legend</text>
        <line x1="80" y1={canvasH - 34} x2="110" y2={canvasH - 34} stroke="#06b6d4" strokeWidth="2" />
        <text x="118" y={canvasH - 30} className="device-sublabel">{directLeafPair ? "Leaf-Leaf 400G interconnect (cyan)" : "Spine-Leaf 400G links (cyan)"}</text>
        <line x1="340" y1={canvasH - 34} x2="370" y2={canvasH - 34} stroke="#0d9488" strokeWidth="2" />
        <text x="378" y={canvasH - 30} className="device-sublabel">Leaf-Server 400G links (teal)</text>
        <text x={canvasW - 96} y={canvasH - 20} textAnchor="end" className="device-sublabel">
          {directLeafPair
            ? `Storage: Direct Leaf Pair  Leaf=${leaf}  GPU=${b300}  Flash=${allFlash}  Ports=${ports400}`
            : `Storage: Spine=${spine}  Leaf=${leaf}  GPU=${b300}  Flash=${allFlash}  Ports=${ports400}`}
        </text>
      </svg>
    </div>
  );
}
// ============== Inband Topology ==============
function InbandTopology({ topology }: { topology: Topology }) {
  const totalServers = numberMetric(topology, "totalServers");
  const ports25 = numberMetric(topology, "ports25");
  const leaf = numberMetric(topology, "leaf");
  const b300 = numberMetric(topology, "b300");
  const allFlash = numberMetric(topology, "allFlash");
  const hybrid = numberMetric(topology, "hybrid");
  const management = numberMetric(topology, "management");
  const perServer = 2;
  const leafCount = Math.min(leaf, 4);
  const serverGroups = [
    { title: "GPU Servers", detail: `${b300} units`, count: b300, x: 30, y: 470 },
    { title: "Flash Storage", detail: `${allFlash} units`, count: allFlash, x: 200, y: 470 },
    { title: "Hybrid Storage", detail: `${hybrid} units`, count: hybrid, x: 370, y: 470 },
    { title: "Management", detail: `${management} units`, count: management, x: 540, y: 470 }
  ];
  const leafServerPaths: Array<Array<[number, number]>> = [];
  serverGroups.forEach((g) => {
    const leafIdx = Math.min(serverGroups.indexOf(g), leafCount - 1);
    const leafX = 60 + leafIdx * 180;
    leafServerPaths.push([
      [g.x + 78, g.y],
      [g.x + 78, 392],
      [leafX + 44, 392],
      [leafX + 44, 304]
    ]);
  });
  const leafCorePaths: Array<Array<[number, number]>> = [];
  for (let i = 0; i < leafCount; i++) {
    const lx = 60 + i * 180;
    const coreX = i % 2 === 0 ? 282 : 482;
    leafCorePaths.push([
      [lx + 44, 304],
      [lx + 44, 306],
      [coreX, 306],
      [coreX, 320]
    ]);
  }
  return (
    <div className="topology-scroll">
      <svg viewBox="0 0 800 720" role="img" aria-label={topology.title} className="topology-svg detailed-topology">
        <rect x="20" y="20" width="760" height="170" className="zone-security" />
        <text x="36" y="46" className="zone-heading">瀹夊叏鍑哄彛鍖</text>
        <text x="764" y="46" textAnchor="end" className="zone-sub">闃茬伀澧?2 + 杈圭晫 2</text>
        <SwitchIcon x={140} y={70} tone="graphite" size={48} label="杈圭晫浜ゆ崲鏈?1" detail="2 鍙" />
        <SwitchIcon x={360} y={70} tone="graphite" size={48} label="闃茬伀澧" detail="2 鍙" />
        <SwitchIcon x={580} y={70} tone="graphite" size={48} label="Border" detail="2 鍙" />
        <line x1="190" y1="94" x2="360" y2="94" stroke="#f0aa00" strokeWidth="2" />
        <line x1="410" y1="94" x2="580" y2="94" stroke="#7c2dd6" strokeWidth="2" />
        <text x="275" y="86" className="legend-text" textAnchor="middle">100G</text>
        <text x="495" y="86" className="legend-text" textAnchor="middle">40G</text>

        <rect x="20" y="210" width="760" height="170" className="zone-inband" />
        <text x="36" y="236" className="zone-heading">甯﹀唴鏍稿績 + Leaf 鍖</text>
        <text x="764" y="236" textAnchor="end" className="zone-sub">鏍稿績 2 + Leaf {leaf} 鍙</text>
        <SwitchIcon x={260} y={320} tone="silver" size={44} label="鏍稿績 A" detail="2 鍙" />
        <SwitchIcon x={460} y={320} tone="silver" size={44} label="鏍稿績 B" detail="2 鍙" />
        {Array.from({ length: leafCount }).map((_, i) => (
          <SwitchIcon key={`il-${i}`} x={60 + i * 180} y={260} tone="blue" size={44} label={`Leaf${i + 1}`} detail="" />
        ))}
        {leaf > leafCount && <text x={720} y={330} textAnchor="end" className="ellipsis-text">鈥?{leaf} 鍙</text>}
        <NetworkPaths color="#5b8f33" paths={leafCorePaths} />

        <rect x="20" y="400" width="760" height="240" className="zone" />
        <text x="36" y="426" className="zone-heading">鏈嶅姟鍣?25G 鎺ュ叆鍖猴紙鎸夌被鍨嬪垎缁勶級</text>
        <text x="764" y="426" textAnchor="end" className="zone-sub">{totalServers} 鍙?鈥?{ports25} 涓?25G 鎺ュ彛</text>
        {serverGroups.map((g) => (
          <ServerGroup key={g.title} x={g.x} y={g.y} title={g.title} detail={g.detail} serverCount={g.count} portsPerServer={perServer} width={156} small />
        ))}
        <NetworkPaths color="#5b8f33" paths={leafServerPaths} />
      </svg>
    </div>
  );
}
function InbandTopologyV2({ topology }: { topology: Topology }) {
  const totalServers = numberMetric(topology, "totalServers");
  const ports25 = numberMetric(topology, "ports25");
  const leaf = numberMetric(topology, "leaf");
  const b300 = numberMetric(topology, "b300");
  const allFlash = numberMetric(topology, "allFlash");
  const hybrid = numberMetric(topology, "hybrid");
  const management = numberMetric(topology, "management");
  const perServer = 2;
  const canvasW = 1100;
  const canvasH = 900;
  const switchSize = 44;
  const accessPairCount = Math.max(1, Math.ceil(leaf / 2));
  const visiblePairCount = Math.min(accessPairCount, 4);
  const accessPairStarts = centeredStartPositions(visiblePairCount, 116, 139, canvasW);
  const accessPairs = Array.from({ length: visiblePairCount }, (_, index) => {
    const isGap = leaf > 8 && index === 2;
    const isLastVisiblePair = leaf > 8 && index === visiblePairCount - 1;
    const baseX = accessPairStarts[index];
    const firstLeaf = isLastVisiblePair ? leaf - 1 : index * 2 + 1;
    return {
      index,
      x1: baseX,
      x2: baseX + 72,
      labelA: isGap ? "..." : `Access${firstLeaf}`,
      labelB: isGap ? "" : `Access${firstLeaf + 1}`
    };
  });
  const coreXs = [452, 604];
  const borderXs = [452, 604];
  const firewallXs = [452, 604];
  const edgeXs = [452, 604];
  const edgeY = 58;
  const firewallY = 166;
  const borderY = 280;
  const coreY = 394;
  const accessY = 568;
  const serverY = 724;
  const visibleServerXs = centeredStartPositions(
    [b300, allFlash, hybrid, management].filter((count) => count > 0).length,
    64,
    190,
    canvasW
  );
  const serverGroups = [
    { label: "GPU", title: "GPU Servers", detail: `${b300} 台 GPU`, count: b300, x: 126, y: serverY },
    { label: "Flash", title: "Flash Storage", detail: `${allFlash} 台全闪`, count: allFlash, x: 380, y: serverY },
    { label: "Hybrid", title: "Hybrid Storage", detail: `${hybrid} 台混闪`, count: hybrid, x: 634, y: serverY },
    { label: "Mgmt", title: "Management", detail: `${management} 台管理`, count: management, x: 888, y: serverY }
  ];

  const visibleServerGroups = serverGroups
    .filter((group) => group.count > 0)
    .map((group, index) => ({ ...group, x: visibleServerXs[index] }));

  function linkPath(x1: number, y1: number, x2: number, y2: number, bend = 0.38): string {
    const dy = Math.abs(y2 - y1) * bend;
    return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
  }

  function renderSwitchPair(
    key: string,
    xs: number[],
    y: number,
    labels: [string, string],
    tone: "blue" | "cyan" | "silver" | "graphite",
    linkLabel: string
  ) {
    return (
      <g key={key}>
        <SwitchIcon x={xs[0]} y={y} tone={tone} size={switchSize} label={labels[0]} detail="" />
        <SwitchIcon x={xs[1]} y={y} tone={tone} size={switchSize} label={labels[1]} detail="" />
        {[0, 1, 2].map((line) => (
          <line
            key={`${key}-mlag-${line}`}
            x1={xs[0] + switchSize}
            y1={y + 14 + line * 8}
            x2={xs[1]}
            y2={y + 14 + line * 8}
            className="inband-mlag-link"
          />
        ))}
        <text x={(xs[0] + xs[1] + switchSize) / 2} y={y - 10} textAnchor="middle" className="device-sublabel">{linkLabel}</text>
      </g>
    );
  }

  function renderInbandServerNode(group: (typeof serverGroups)[number]) {
    return (
      <g key={group.title}>
        <StorageServerNode x={group.x} y={group.y} label={group.label} portsPerServer={perServer} />
        <text x={group.x + 32} y={group.y + 66} textAnchor="middle" className="server-group-title">{group.title}</text>
        <text x={group.x + 32} y={group.y + 84} textAnchor="middle" className="server-group-detail">{group.detail}</text>
      </g>
    );
  }

  const accessCoreLinks = accessPairs.flatMap((pair) =>
    [pair.x1, pair.x2].flatMap((accessX) =>
      coreXs.map((coreX) => linkPath(accessX + switchSize / 2, accessY, coreX + switchSize / 2, coreY + switchSize))
    )
  );
  const coreBorderLinks = coreXs.flatMap((coreX) =>
    borderXs.map((borderX) => linkPath(coreX + switchSize / 2, coreY, borderX + switchSize / 2, borderY + switchSize))
  );
  const borderFirewallLinks = borderXs.flatMap((borderX) =>
    firewallXs.map((firewallX) => linkPath(borderX + switchSize / 2, borderY, firewallX + switchSize / 2, firewallY + switchSize))
  );
  const firewallEdgeLinks = firewallXs.flatMap((firewallX) =>
    edgeXs.map((edgeX) => linkPath(firewallX + switchSize / 2, firewallY, edgeX + switchSize / 2, edgeY + switchSize))
  );
  const serverAccessLinks = visibleServerGroups.flatMap((group, index) => {
    const pair = accessPairs[Math.min(index, accessPairs.length - 1)];
    const startX = group.x + 24;
    return [
      linkPath(startX - 14, group.y, pair.x1 + switchSize / 2, accessY + switchSize),
      linkPath(startX + 14, group.y, pair.x2 + switchSize / 2, accessY + switchSize)
    ];
  });

  return (
    <div className="topology-scroll">
      <svg viewBox={`0 0 ${canvasW} ${canvasH}`} role="img" aria-label={topology.title} className="topology-svg detailed-topology" style={{ minWidth: `${canvasW}px` }}>
        <rect x="20" y="24" width={canvasW - 40} height="112" rx="10" className="storage-lane-frame" />
        <line x1="34" y1="48" x2="34" y2="112" className="storage-lane-accent" />
        <text x="48" y="52" className="storage-lane-title">边界交换机</text>
        <text x={canvasW - 70} y="52" textAnchor="end" className="storage-lane-meta">2 台，3 条横联，防火墙双上联</text>
        {renderSwitchPair("edge", edgeXs, edgeY, ["Edge1", "Edge2"], "cyan", "M-LAG")}

        <rect x="20" y="142" width={canvasW - 40} height="112" rx="10" className="storage-lane-frame" />
        <line x1="34" y1="166" x2="34" y2="230" className="storage-lane-accent" />
        <text x="48" y="170" className="storage-lane-title">防火墙 HA</text>
        <text x={canvasW - 70} y="170" textAnchor="end" className="storage-lane-meta">2 台，HA 横联 2 条</text>
        <SwitchIcon x={firewallXs[0]} y={firewallY} tone="graphite" size={switchSize} label="FW1" detail="" />
        <SwitchIcon x={firewallXs[1]} y={firewallY} tone="graphite" size={switchSize} label="FW2" detail="" />
        {[0, 1].map((line) => (
          <line
            key={`ha-${line}`}
            x1={firewallXs[0] + switchSize}
            y1={firewallY + 18 + line * 8}
            x2={firewallXs[1]}
            y2={firewallY + 18 + line * 8}
            className="inband-ha-link"
          />
        ))}

        <rect x="20" y="260" width={canvasW - 40} height="112" rx="10" className="storage-lane-frame" />
        <line x1="34" y1="284" x2="34" y2="348" className="storage-lane-accent" />
        <text x="48" y="288" className="storage-lane-title">Border M-LAG</text>
        <text x={canvasW - 70} y="288" textAnchor="end" className="storage-lane-meta">2 台，3 条横联</text>
        {renderSwitchPair("border", borderXs, borderY, ["Border1", "Border2"], "cyan", "M-LAG")}

        <rect x="20" y="378" width={canvasW - 40} height="112" rx="10" className="storage-lane-frame" />
        <line x1="34" y1="402" x2="34" y2="466" className="storage-lane-accent" />
        <text x="48" y="406" className="storage-lane-title">带内核心 M-LAG</text>
        <text x={canvasW - 70} y="406" textAnchor="end" className="storage-lane-meta">2 台核心，接入/Border 双归</text>
        {renderSwitchPair("core", coreXs, coreY, ["Core1", "Core2"], "silver", "M-LAG")}

        <rect x="20" y="496" width={canvasW - 40} height="162" rx="10" className="storage-lane-frame" />
        <line x1="34" y1="520" x2="34" y2="596" className="storage-lane-accent" />
        <text x="48" y="524" className="storage-lane-title">带内接入 M-LAG</text>
        <text x={canvasW - 70} y="524" textAnchor="end" className="storage-lane-meta">{leaf} 台接入，按两台一组</text>
        {accessPairs.map((pair) => (
          <g key={`access-pair-${pair.index}`}>
            {renderSwitchPair(`access-${pair.index}`, [pair.x1, pair.x2], accessY, [pair.labelA, pair.labelB], "blue", "M-LAG")}
          </g>
        ))}
        {leaf > visiblePairCount * 2 && <text x={canvasW - 90} y={accessY + 70} textAnchor="end" className="ellipsis-text">... 共 {leaf} 台</text>}

        <rect x="20" y="680" width={canvasW - 40} height="178" rx="10" className="storage-server-frame" />
        <line x1="34" y1="704" x2="34" y2="792" className="storage-lane-accent" />
        <text x="48" y="708" className="storage-lane-title">服务器 25G 带内接入</text>
        <text x={canvasW - 70} y="708" textAnchor="end" className="storage-lane-meta">{totalServers} 台 / {ports25} 个 25G 端口</text>
        {visibleServerGroups.map((g) => renderInbandServerNode(g))}

        {firewallEdgeLinks.map((d, index) => <path key={`fe-${index}`} d={d} className="inband-link inband-link-40g" />)}
        {borderFirewallLinks.map((d, index) => <path key={`bf-${index}`} d={d} className="inband-link inband-link-40g" />)}
        {coreBorderLinks.map((d, index) => <path key={`cb-${index}`} d={d} className="inband-link inband-link-100g" />)}
        {accessCoreLinks.map((d, index) => <path key={`ac-${index}`} d={d} className="inband-link inband-link-100g" />)}
        {serverAccessLinks.map((d, index) => <path key={`sa-${index}`} d={d} className="inband-link inband-link-25g" />)}

        <rect x="20" y={canvasH - 44} width={canvasW - 40} height="32" rx="6" fill="#f0f2f5" stroke="#b0b8c4" strokeWidth="1.2" />
        <text x="38" y={canvasH - 22} className="device-sublabel" fontWeight="600">Legend</text>
        <line x1="100" y1={canvasH - 28} x2="132" y2={canvasH - 28} className="inband-link-25g" />
        <text x="140" y={canvasH - 24} className="device-sublabel">25G server dual-homing</text>
        <line x1="318" y1={canvasH - 28} x2="350" y2={canvasH - 28} className="inband-link-100g" />
        <text x="358" y={canvasH - 24} className="device-sublabel">100G access/core/border</text>
        <line x1="580" y1={canvasH - 28} x2="612" y2={canvasH - 28} className="inband-link-40g" />
        <text x="620" y={canvasH - 24} className="device-sublabel">40G border/firewall/edge</text>
        <line x1="836" y1={canvasH - 28} x2="868" y2={canvasH - 28} className="inband-mlag-link" />
        <text x="876" y={canvasH - 24} className="device-sublabel">M-LAG / HA cross-link</text>
      </svg>
    </div>
  );
}

// ============== OOB Topology ==============
function OobTopology({ topology }: { topology: Topology }) {
  const totalServers = numberMetric(topology, "totalServers");
  const upstream = numberMetric(topology, "upstreamDeviceCount");
  const oobPorts = numberMetric(topology, "oobPorts");
  const access = numberMetric(topology, "access");
  const b300 = numberMetric(topology, "b300");
  const allFlash = numberMetric(topology, "allFlash");
  const hybrid = numberMetric(topology, "hybrid");
  const management = numberMetric(topology, "management");
  const model = buildOobTopologyViewModel({
    b300,
    allFlash,
    hybrid,
    management,
    upstreamDeviceCount: upstream,
    access,
    totalServers,
    oobPorts
  });

  return (
    <div className="topology-scroll">
      <svg viewBox={`0 0 ${model.canvasW} ${model.canvasH}`} role="img" aria-label={topology.title} className="topology-svg detailed-topology" style={{ minWidth: `${model.canvasW}px` }}>
        <rect x="20" y="20" width={model.canvasW - 40} height="200" className="zone-oob" />
        <text x="36" y="46" className="zone-heading">OOB 汇聚区</text>
        <text x={model.canvasW - 36} y="46" textAnchor="end" className="zone-sub">2 台汇聚，双上联</text>
        <NetworkPaths color="#f04d4d" paths={model.aggregationCorePaths} />
        <NetworkPaths color="#f04d4d" paths={model.aggregationStackPaths} />
        {model.aggregationSwitches.map((sw) => (
          <SwitchIcon key={sw.label} x={sw.x} y={sw.y} tone="silver" size={sw.size} label={sw.label} detail={sw.detail} />
        ))}

        <rect x="20" y="246" width={model.canvasW - 40} height="270" className="zone" />
        <text x="36" y="272" className="zone-heading">OOB 接入区</text>
        <text x={model.canvasW - 36} y="272" textAnchor="end" className="zone-sub">接入交换机 {access} 台</text>
        <NetworkPaths color="#f04d4d" paths={model.accessAggPaths} />
        {model.accessSwitches.map((sw, i) => (
          <SwitchIcon key={`oa-${i}`} x={sw.x} y={sw.y} tone="blue" size={sw.size} label={sw.label} detail="GE" />
        ))}
        {model.hasCollapsedAccess && <text x={model.ellipsis.x} y={model.ellipsis.y} textAnchor="middle" className="ellipsis-text">...</text>}

        <rect x="20" y="530" width={model.canvasW - 40} height="190" className="zone" />
        <text x="36" y="556" className="zone-heading">管理对象区</text>
        <text x={model.canvasW - 36} y="556" textAnchor="end" className="zone-sub">{model.summary}</text>
        <NetworkPaths color="#f04d4d" paths={model.accessObjectPaths} />
        {model.objectGroups.map((g) => (
          <ServerGroup key={g.kind} x={g.x} y={g.y} title={g.title} detail={g.detail} serverCount={g.count} portsPerServer={1} width={g.width} small />
        ))}

        <line x1="54" y1={model.canvasH - 28} x2="92" y2={model.canvasH - 28} stroke="#f04d4d" strokeWidth="2" />
        <text x="104" y={model.canvasH - 24} className="device-sublabel">GE 带外管理链路：OOB 接入到服务器 BMC、网络/安全设备管理口</text>
      </svg>
    </div>
  );
}
// ============== Overview Topology ==============
function OverviewTopology({ topology }: { topology: Topology }) {
  const model = buildOverviewTopologyViewModel(topology.metrics as OverviewTopologyMetrics);
  const managedObject = model.oobManagedObject;
  const zoneLookup = Object.fromEntries(model.zones.map((zone) => [zone.key, zone])) as Record<string, (typeof model.zones)[number]>;
  const securityZone = zoneLookup.security;
  const computeZone = zoneLookup.compute;
  const storageZone = zoneLookup.storage;
  const inbandZone = zoneLookup.inband;
  const oobZone = zoneLookup.oob;
  const serverZone = zoneLookup.servers;

  const securityDeviceMap = Object.fromEntries(model.securityDevices.map((device) => [device.key, device])) as Record<string, (typeof model.securityDevices)[number]>;
  const edgeDevices = model.securityDevices.slice(0, 2);
  const firewallDevices = model.securityDevices.slice(2, 4);
  const borderDevices = model.securityDevices.slice(4, 6);
  const coreDevices = model.securityDevices.slice(6, 8);

  function renderZoneTitle(
    zone: { x: number; y: number; title: string; subtitle: string },
    className = "zone-heading",
    subtitleClassName = "zone-sub"
  ) {
    return (
      <>
        <text x={zone.x + 14} y={zone.y + 22} className={className}>
          {zone.title}
        </text>
        <text x={zone.x + 14} y={zone.y + 44} className={subtitleClassName}>
          {zone.subtitle}
        </text>
      </>
    );
  }

  function renderDevice(device: {
    key: string;
    label: string;
    detail: string;
    x: number;
    y: number;
    tone: "blue" | "cyan" | "silver" | "graphite";
    size?: number;
  }) {
    return (
      <SwitchIcon
        key={device.key}
        x={device.x}
        y={device.y}
        tone={device.tone}
        size={device.size ?? 48}
        label={device.label}
        detail={device.detail}
      />
    );
  }

  function renderNicGroupLabel(group: { label: string; count: number; x: number; y: number; w: number }) {
    return (
      <>
        <text x={group.x + 8} y={group.y + 11} className="overview-nic-label">
          {group.label}
        </text>
        <text x={group.x + group.w - 8} y={group.y + 11} textAnchor="end" className="overview-nic-count">
          {group.count}
        </text>
      </>
    );
  }

  return (
    <div className="topology-scroll">
      <svg
        viewBox={`0 0 ${model.canvasW} ${model.canvasH}`}
        role="img"
        aria-label={topology.title}
        className="topology-svg overview detailed-topology"
        style={{ minWidth: `${model.canvasW}px` }}
      >
          <Legend items={model.legendItems} x={70} y={174} width={268} title="图例" />

        <g>
          <rect x={securityZone.x} y={securityZone.y} width={securityZone.w} height={securityZone.h} className={securityZone.className} rx="0" />
          <text x={securityZone.x + securityZone.w / 2} y={securityZone.y + 24} textAnchor="middle" className="zone-heading">
            安全出口区域
          </text>
          <text x={securityZone.x + 28} y={securityZone.y + 48} className="overview-inline-label">
            边界交换机
          </text>
          <text x={securityZone.x + 28} y={securityZone.y + 116} className="overview-inline-label">
            防火墙
          </text>
          <text x={securityZone.x + 28} y={securityZone.y + 184} className="overview-inline-label">
            BORDER
          </text>
          {edgeDevices.map((device) => renderDevice(device))}
          {firewallDevices.map((device, index) => (
            <HexIcon key={device.key} x={device.x - 4} y={device.y + 2} label={`FW${index + 1}`} tone="blue" />
          ))}
          {borderDevices.map((device) => renderDevice(device))}
        </g>

        <g>
          <rect x={computeZone.x} y={computeZone.y} width={computeZone.w} height={computeZone.h} className={computeZone.className} rx="0" />
          {renderZoneTitle(computeZone)}
        </g>

        <g>
          <rect x={storageZone.x} y={storageZone.y} width={storageZone.w} height={storageZone.h} className={storageZone.className} rx="0" />
          {renderZoneTitle(storageZone)}
        </g>

        <g>
          <rect x={inbandZone.x} y={inbandZone.y} width={inbandZone.w} height={inbandZone.h} className={inbandZone.className} rx="0" />
          <text x={inbandZone.x + 14} y={inbandZone.y + 22} className="zone-heading">
            {inbandZone.title}
          </text>
          <text x={inbandZone.x + inbandZone.w - 14} y={inbandZone.y + 22} textAnchor="end" className="zone-sub">
            {inbandZone.subtitle}
          </text>
          <rect
            x={securityDeviceMap.core1.x - 16}
            y={securityDeviceMap.core1.y - 8}
            width="174"
            height="62"
            rx="8"
            className="zone zone-dashed"
          />
          {coreDevices.map((device) => renderDevice(device))}
        </g>

        <g>
          <rect x={oobZone.x} y={oobZone.y} width={oobZone.w} height={oobZone.h} className={oobZone.className} rx="0" />
          {renderZoneTitle(oobZone)}
        </g>

        <g>
          <rect x={serverZone.x} y={serverZone.y} width={serverZone.w} height={serverZone.h} rx="0" className={serverZone.className} />
          {model.showServerSourceCallout && (
            <>
              <path d="M 190 514 C 242 480, 402 474, 506 516" fill="none" className="overview-callout-curve" />
              <text x="348" y="504" textAnchor="middle" className="overview-inline-label">
                参数导入、参数存储
              </text>
            </>
          )}
        </g>

        {model.internalLinks.map((link) => (
          <NetworkPaths key={link.key} color={link.color} paths={[link.path]} dashed={link.dashed} />
        ))}
        {model.sourceLinks.map((link) => (
          <NetworkPaths key={link.key} color={link.color} paths={[link.path]} dashed={link.dashed} />
        ))}

        {model.computeDevices.map((device) => renderDevice(device))}
        {model.storageDevices.map((device) => renderDevice(device))}
        {model.inbandDevices.map((device) => renderDevice(device))}
        {model.oobDevices.map((device) => renderDevice(device))}

        {model.computeState && (
          <g>
            <rect x={model.computeState.x} y={model.computeState.y} width={model.computeState.w} height={model.computeState.h} rx="10" className="overview-state-box warning" />
            <text x={model.computeState.x + 14} y={model.computeState.y + 24} className="overview-state-title">
              {model.computeState.title}
            </text>
            <text x={model.computeState.x + 14} y={model.computeState.y + 48} className="overview-state-detail">
              {model.computeState.detail}
            </text>
          </g>
        )}

        {model.storageState && (
          <g>
            <rect x={model.storageState.x} y={model.storageState.y} width={model.storageState.w} height={model.storageState.h} rx="10" className="overview-state-box" />
            <text x={model.storageState.x + 14} y={model.storageState.y + 24} className="overview-state-title">
              {model.storageState.title}
            </text>
            <text x={model.storageState.x + 14} y={model.storageState.y + 48} className="overview-state-detail">
              {model.storageState.detail}
            </text>
          </g>
        )}

        {managedObject && (
          <g>
            <rect x={managedObject.x} y={managedObject.y} width={managedObject.w} height="88" rx="0" className="overview-managed-box" />
            <text x={managedObject.x + 10} y={managedObject.y + 18} className="overview-managed-title">
              {managedObject.title}
            </text>
            <text x={managedObject.x + 10} y={managedObject.y + 36} className="overview-managed-detail">
              {managedObject.detail}
            </text>
            {managedObject.items.map((item, index) => (
              <g key={item}>
                <circle cx={managedObject.x + 14} cy={managedObject.y + 56 + index * 18} r="3" className="overview-managed-dot" />
                <text x={managedObject.x + 24} y={managedObject.y + 60 + index * 18} className="overview-managed-item">
                  {item}
                </text>
              </g>
            ))}
          </g>
        )}

        {model.serverGroups.map((group) => (
          <g key={group.key}>
            <rect x={group.x} y={group.y} width={group.w} height={group.h} rx="0" className="overview-server-box" />
            <rect x={group.chassis.x} y={group.chassis.y} width={group.chassis.w} height={group.chassis.h} rx="0" className="overview-server-chassis" />
            <text x={group.chassis.x + group.chassis.w / 2} y={group.chassis.y + 23} textAnchor="middle" className="overview-server-foot">
              {group.key === "b300"
                ? "compute"
                : group.key === "allFlash"
                ? "All-Flash Storage"
                : group.key === "hybrid"
                ? "Hybrid Flash Storage"
                : "management"}
            </text>
            {group.nicGroups.map((nicGroup) => (
              <g key={`${group.key}-${nicGroup.key}`}>
                <rect x={nicGroup.x} y={nicGroup.y} width={nicGroup.w} height={nicGroup.h} rx="2" className="overview-nic-lane" />
                {renderNicGroupLabel(nicGroup)}
                {nicGroup.ports.map((port, index) => (
                  <rect
                    key={`${group.key}-${nicGroup.key}-${index}`}
                    x={port.x}
                    y={port.y}
                    width={port.w}
                    height={port.h}
                    rx="2"
                    fill={nicGroup.color}
                    className="overview-nic-port"
                  />
                ))}
              </g>
            ))}
            <text x={group.x + group.w / 2} y={group.y + group.h - 16} textAnchor="middle" className="overview-server-caption">
              {group.title}
            </text>
            <text x={group.x + group.w / 2} y={group.y + group.h - 34} textAnchor="middle" className="overview-server-count">
              {group.count} 台
            </text>
          </g>
        ))}

        {model.serverZoneNote ? (
          <text x="44" y="684" className="overview-footnote">
            {model.serverZoneNote}
          </text>
        ) : null}
        <rect x="28" y={model.canvasH - 56} width={model.canvasW - 56} height="28" rx="0" className="overview-footnote-box" />
        <text x={model.canvasW / 2} y={model.canvasH - 37} textAnchor="middle" className="overview-footnote">
          {model.footnote}
        </text>
      </svg>
    </div>
  );
}

// ============== Fallback (data-driven) ==============
function FallbackTopology({ topology }: { topology: Topology }) {
  return (
    <div className="topology-scroll">
      <svg viewBox="0 0 800 360" role="img" aria-label={topology.title} className="topology-svg">
        {topology.nodes.map((node) => (
          <g key={node.id}>
            <rect x={node.x - 60} y={node.y - 30} width="120" height="60" rx="8" className="fallback-node" />
            <text x={node.x} y={node.y - 4} className="node-label">{node.label}</text>
            <text x={node.x} y={node.y + 14} className="node-detail">{node.detail}</text>
          </g>
        ))}
        {topology.links.map((link) => {
          const a = topology.nodes.find((n) => n.id === link.from);
          const b = topology.nodes.find((n) => n.id === link.to);
          if (!a || !b) return null;
          return (
            <g key={`${link.from}-${link.to}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#6ea8fe" strokeWidth="1.6" />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} className="link-label">{link.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
