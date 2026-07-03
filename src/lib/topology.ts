import type { OverviewTopologyMetrics, Topology, TopologyLink, TopologyNode } from "../types";

export function makeTopology(
  title: string,
  subtitle: string,
  nodes: TopologyNode[],
  links: TopologyLink[],
  options: Pick<Topology, "variant" | "metrics"> = {}
): Topology {
  return { title, subtitle, nodes, links, ...options };
}

export function overviewTopology(metrics: OverviewTopologyMetrics): Topology {
  return makeTopology("统一大拓扑", "服务器网卡为源，按计算 / 存储 / 带内 / 带外分流", [], [], {
    variant: "overview",
    metrics
  });
}
