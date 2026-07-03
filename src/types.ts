export type NetworkKey = "compute" | "storage" | "inband" | "oob";
export type TopologyMetricValue = number | string | boolean;
export type TopologyMetrics = Record<string, TopologyMetricValue>;

export interface OverviewTopologyMetrics extends TopologyMetrics {
  b300: number;
  allFlash: number;
  hybrid: number;
  management: number;
  gpuStoragePortsPerServer: number;
  allFlashStoragePortsPerServer: number;
  computeSupported: boolean;
  storageEnabled: boolean;
  computeLeaf: number;
  computeSpine: number;
  storageLeaf: number;
  storageSpine: number;
  inbandLeaf: number;
  inbandCore: number;
  inbandBorder: number;
  exitSwitches: number;
  firewalls: number;
  oobAccess: number;
  oobAggregation: number;
  oobManagedDeviceCount: number;
  computeFromB300: boolean;
  storageFromB300: boolean;
  storageFromAllFlash: boolean;
  inbandFromB300: boolean;
  inbandFromAllFlash: boolean;
  inbandFromHybrid: boolean;
  inbandFromManagement: boolean;
  oobFromB300: boolean;
  oobFromAllFlash: boolean;
  oobFromHybrid: boolean;
  oobFromManagement: boolean;
}

export interface InputState {
  b300Servers: number;
  allFlashServers: number;
  hybridStorageServers: number;
  managementServers: number;
  gpuStoragePortsPerServer: number;
  allFlashStoragePortsPerServer: number;
}

export interface BomItem {
  network: string;
  sequence: string;
  productName: string;
  model: string;
  description: string;
  quantity: number | string;
  formula: string;
}

export interface TopologyNode {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  tone: "blue" | "cyan" | "silver" | "graphite";
}

export interface TopologyLink {
  from: string;
  to: string;
  label: string;
}

export interface Topology {
  title: string;
  subtitle: string;
  nodes: TopologyNode[];
  links: TopologyLink[];
  variant?: NetworkKey | "overview";
  metrics?: TopologyMetrics;
}

export interface NetworkResult {
  key: NetworkKey;
  title: string;
  summary: Record<string, number | string>;
  items: BomItem[];
  topology: Topology;
  notes: string[];
}

export interface CalculationResult {
  inputs: InputState;
  isComputeSupported: boolean;
  warnings: string[];
  networks: NetworkResult[];
  overviewTopology: Topology;
}
